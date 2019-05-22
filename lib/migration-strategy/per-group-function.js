'use strict';

const PerFunction = require('./per-function');

class PerGroupFunction extends PerFunction {

  constructor(plugin) {
    super(plugin);

    if (plugin.config.perGroupFunction) {
      if (
        !plugin.config.chainCount
        || typeof plugin.config.chainCount !== 'number'
        || !Number.isInteger(plugin.config.chainCount)
        || plugin.config.chainCount < 2
      ) {
        throw Error('chainCount configuration must be an integer greater than 2');
      }

      // Super class will not call them as we don't use the same configuration here
      this.apiGatewayResourceMap = this.getApiGatewayResourceMap(plugin.serverless);
      this.lambdaNames = this.getAllNormalizedLambdaNames(plugin.serverless);

      this.chainCount = this.plugin.config.chainCount;
      const provider = this.plugin.serverless.getProvider('aws');
      this.logicalIds = {};
      this.rootLambdaNames = {};

      Object.keys(this.plugin.serverless.service.functions).forEach(lambdaName => {
        const normalizedLambdaName = this.plugin.provider.naming.getNormalizedFunctionName(lambdaName);
        const logicalId = provider.naming.getLambdaLogicalId(lambdaName);
        const index = this.lambdaNames.indexOf(normalizedLambdaName);

        this.logicalIds[normalizedLambdaName] = logicalId;
        this.rootLambdaNames[normalizedLambdaName] = this.lambdaNames[index % this.chainCount];
      });
    }
  }


  migration(resource, logicalId) {
    if (this.plugin.config.perGroupFunction) {
      const destination = this.getDestination(resource, logicalId);

      if (destination) {
        return {destination};
      }
    }
  }

  getDestination(resource, logicalId) {
    let normalizedLambdaName;

    if (['AWS::ApiGateway::Method', 'AWS::ApiGateway::Resource'].indexOf(resource.Type) !== -1) {
      normalizedLambdaName = this.getApiGatewayDestination(logicalId);
    } else {
      normalizedLambdaName = this.getLambdaDestination(logicalId);
    }

    if (normalizedLambdaName) {
      this.setDependsOn(resource, logicalId, normalizedLambdaName);
      return this.rootLambdaNames[normalizedLambdaName];
    }
}

  setDependsOn(resource, logicalId, normalizedLambdaName) {
    // Lambda already depends on LogGroups, we don't want to create Circular dependencies
    if (resource.Type === 'AWS::Logs::LogGroup') {
      return;
    }

    const index = this.lambdaNames.indexOf(normalizedLambdaName);
    const dependsOnLambdaName = index >= this.chainCount ? this.lambdaNames[index - this.chainCount] : null;

    if (dependsOnLambdaName) {
      const provider = this.plugin.serverless.getProvider('aws');
      const dependsOnLogicalId = provider.naming.getLambdaLogicalId(dependsOnLambdaName);
      let dependsOn = [dependsOnLogicalId];

      if (resource.DependsOn) {
        dependsOn = dependsOn.concat(resource.DependsOn)
      }

      resource.DependsOn = dependsOn;
    }
  }
}

module.exports = PerGroupFunction;
