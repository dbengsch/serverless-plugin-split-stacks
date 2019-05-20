'use strict';

module.exports = class PerFunction {

  constructor(plugin) {
    Object.assign(this, { plugin });

    if (plugin.config.perFunction) {
      this.lambdaNames = this.getAllNormalizedLambdaNames(plugin.serverless);
      this.chainCount = 0;

      if (plugin.config.chainCount
        && typeof plugin.config.chainCount === 'number'
        && Number.isInteger(plugin.config.chainCount)
      ) {
        const provider = plugin.serverless.getProvider('aws');
        this.chainCount = plugin.config.chainCount;
        this.logicalIds = {};
        this.lambdaNamesByLogicalId = {};
        this.rootLambdaNames = {};

        Object.keys(plugin.serverless.service.functions).forEach((lambdaName, index) => {
          const normalizedLambdaName = this.plugin.provider.naming.getNormalizedFunctionName(lambdaName);
          const logicalId = provider.naming.getLambdaLogicalId(lambdaName);

          this.logicalIds[normalizedLambdaName] = logicalId;
          this.lambdaNamesByLogicalId[logicalId] = normalizedLambdaName;
          this.rootLambdaNames[normalizedLambdaName] = index >= this.chainCount
            ? this.lambdaNames[index % this.chainCount]
            : null;
        });
      }

      this.apiGatewayResourceMap = this.getApiGatewayResourceMap(plugin.serverless);
    }
  }

  migration(resource, logicalId) {
    const destination = this.getDestination(resource, logicalId);

    if (destination) {
      return { destination };
    }
  }

  getDestination(resource, logicalId) {
    switch (resource.Type) {
      case 'AWS::ApiGateway::Method':
      case 'AWS::ApiGateway::Resource':
        return this.getApiGatewayDestination(logicalId);
      case 'AWS::Lambda::Function':
        this.setDependsOn(logicalId);
        return this.getLambdaDestination(logicalId);
      default:
        // All other resource types if their name starts with one of the lambda names
        // are propagated to given lambda stack
        return this.getLambdaDestination(logicalId);
    }
  }

  setDependsOn(logicalId) {
    if (!this.chainCount) {
      return;
    }

    const lambdaName = this.lambdaNamesByLogicalId[logicalId];
    const index = this.lambdaNames.indexOf(lambdaName);
    const resource = this.plugin.serverless.service.provider.compiledCloudFormationTemplate.Resources[logicalId];
    const dependsOnLambdaName = index >= this.chainCount ? this.lambdaNames[index - this.chainCount] : null;

    if (dependsOnLambdaName) {
      const provider = this.plugin.serverless.getProvider('aws');
      const dependsOnLogicalId = provider.naming.getLambdaLogicalId(dependsOnLambdaName);
      const dependsOn = [dependsOnLogicalId];

      if (resource.DependsOn !== undefined) {
        dependsOn.concat(resource.DependsOn)
      }

      resource.DependsOn = dependsOn;
    }
  }

  getApiGatewayDestination(logicalId) {
    if (this.apiGatewayResourceMap) {
      return this.apiGatewayResourceMap.get(logicalId);
    }
  }

  getLambdaDestination(logicalId) {
    if (this.lambdaNames) {
      let lambdaName = null;

      // TODO: this could probably use a tree structure
      this.lambdaNames.some(normalizedLambdaName => {
        if (logicalId.startsWith(normalizedLambdaName)) {
          lambdaName = this.rootLambdaNames[normalizedLambdaName] || normalizedLambdaName;

          return true;
        }
        return false;
      });

      if (lambdaName) {
        return lambdaName;
      }
    }
  }

  getAllNormalizedLambdaNames(serverless) {
    // (it's the Serverless internal convention to prefix most lambda specific resources
    // with normalized lambda name)
    return Object.keys(serverless.service.functions)
      .map(lambdaName => this.plugin.provider.naming.getNormalizedFunctionName(lambdaName));
  }

  getApiGatewayResourceMap(serverless) {
    // AwsCompileApigEvents plugin provides access to data maps and methods
    // that allow to easily map generated resources to lambdas
    const apiGatewayPlugin = serverless.pluginManager.plugins.find(
      plugin => plugin.constructor.name === 'AwsCompileApigEvents'
    );

    // Result map: resource id to normalized function name
    const resourceMap = new Map();

    // Temporary map that helps to detect how many functions depend on given resource.
    // If there's more than one function then we keep the resource in main stack.
    const resourceLambdasMap = new Map();

    // Iterate over all configured HTTP endpoints
    apiGatewayPlugin.validated.events.map(({ functionName, http }) => {
      // Normalized function name makes part of resource logical id
      const normalizedLambdaName = this.plugin.provider.naming.getNormalizedFunctionName(functionName);

      // AWS::ApiGateway::Method can be deducted directly as it's always mapped to single function
      resourceMap.set(
        this.plugin.provider.naming.getMethodLogicalId(
          apiGatewayPlugin.getResourceName(http.path),
          http.method
        ),
        this.getStackName(normalizedLambdaName)
      );
      // Ensure to support also OPTIONS method (mandatory for CORS support)
      const resourceName = this.plugin.provider.naming.getMethodLogicalId(
        apiGatewayPlugin.getResourceName(http.path),
        'OPTIONS'
      );
      if (!resourceLambdasMap.has(resourceName)) resourceLambdasMap.set(resourceName, new Set());
      resourceLambdasMap.get(resourceName).add(normalizedLambdaName);

      // Collect information about all AWS::ApiGateway::Resource resources that are needed for
      // this endpoint
      const tokens = [];
      http.path.split('/').forEach(token => {
        tokens.push(token);
        const resourceName = this.plugin.provider.naming.getResourceLogicalId(tokens.join('/'));
        if (!resourceLambdasMap.has(resourceName)) {
          resourceLambdasMap.set(resourceName, new Set());
        }
        resourceLambdasMap.get(resourceName).add(normalizedLambdaName);
      });
    });

    // Resolve all AWS::ApiGateway::Resource that map single function, only those will be moved to
    // nested per lambda distributed stacks
    resourceLambdasMap.forEach((normalizedLambdaNames, resourceName) => {
      if (normalizedLambdaNames.size > 1) return;
      const normalizedLambdaName = normalizedLambdaNames.values().next().value;
      resourceMap.set(resourceName, this.getStackName(normalizedLambdaName));
    });

    return resourceMap;
  }

  getStackName(lambdaName) {
    if (!this.chainCount || !this.rootLambdaNames[lambdaName]) {
      return lambdaName
    }

    return this.rootLambdaNames[lambdaName];
  }
};
