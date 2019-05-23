'use strict';

module.exports = function sequenceStacks() {
  if (this.config.stackSequence) {
    let lastLogicalId;

    Object.keys(this.nestedStacks).forEach(logicalId => {
      const resource = this.rootTemplate.Resources[logicalId];

      if (lastLogicalId) {
        let dependsOn = [lastLogicalId];

        if (resource.DependsOn) {
          dependsOn = dependsOn.concat(resource.DependsOn)
        }

        resource.DependsOn = dependsOn;
      }

      lastLogicalId = logicalId;
    })
  }
};
