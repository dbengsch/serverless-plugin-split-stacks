'use strict';

const _ = require('lodash');

module.exports = function sequenceStacks() {
  if (this.config.stackSequence) {
    let lastLogicalId;

    _.each(this.nestedStacks, (resource, logicalId) => {
      if (lastLogicalId) {
        let dependsOn = [lastLogicalId];

        if (resource.DependsOn) {
          dependsOn = dependsOn.concat(resource.DependsOn)
        }

        resource.DependsOn = dependsOn;
      } else {
        lastLogicalId = logicalId;
      }
    })
  }
};
