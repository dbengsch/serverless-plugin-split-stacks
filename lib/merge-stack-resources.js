'use strict';

const _ = require('lodash');

module.exports = function mergeStackResources() {
  if (this.resourceMigrations) {
    let lastLogicalId;

    _.each(this.resourceMigrations, migration => {
      if (this.config.stackSequence && migration.stackResource.Type === 'AWS::CloudFormation::Stack') {
        if (lastLogicalId) {
          let dependsOn = [lastLogicalId];

          if (migration.stackResource.DependsOn) {
            dependsOn = dependsOn.concat(migration.stackResource.DependsOn)
          }

          migration.stackResource.DependsOn = dependsOn;
        } else {
          lastLogicalId = migration.stackResource.logicalId;
        }
      }

      delete this.rootTemplate.Resources[migration.logicalId];
      this.rootTemplate.Resources[migration.stackName] = migration.stackResource;
    });
  }
};
