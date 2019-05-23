'use strict';

const crypto = require('crypto');

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
      this.lambdaStacks = {};
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
      return this.getNestedStackName(normalizedLambdaName);
    }
  }

  setDependsOn(resource, logicalId, normalizedLambdaName) {
    // Lambda already depends on LogGroups, we don't want to create Circular dependencies
    if (resource.Type === 'AWS::Logs::LogGroup') {
      return;
    }

    const nestedStackName = this.getNestedStackName(normalizedLambdaName);
    let dependsOnLogicalId;

    if (this.lambdaStacks[nestedStackName]) {
      const lastIndex = this.lambdaStacks[nestedStackName].length - 1;
      dependsOnLogicalId = this.lambdaStacks[nestedStackName][lastIndex];
    } else {
      this.lambdaStacks[nestedStackName] = []
    }

    this.lambdaStacks[nestedStackName].push(logicalId);

    if (dependsOnLogicalId) {
      let dependsOn = [dependsOnLogicalId];

      if (resource.DependsOn) {
        dependsOn = dependsOn.concat(resource.DependsOn)
      }

      resource.DependsOn = dependsOn;
    }
  }

  getNestedStackName(normalizedLambdaName) {
    const hash = crypto.createHash('sha1').update(normalizedLambdaName).digest('hex');

    return Number.parseInt(hash.substring(0,4), 16) % this.chainCount;
  }
}

module.exports = PerGroupFunction;
