'use strict';

const test = require('ava');

const sequenceStacks = require('../lib/sequence-stacks');

const countDependsOn = function (rootResources) {
  return Object.keys(rootResources).filter(resourceName => rootResources[resourceName].DependsOn).length
};

const doesNotBecomeCircular = function (rootResources) {
  const memo = {};

  Object.keys(rootResources).forEach(resourceName => {
    const resource = rootResources[resourceName];
    if (resource.DependsOn) {
      resource.DependsOn.forEach(parent => {
        if (!memo[parent]) {
          memo[parent] = 1;
        } else {
          memo[parent]++;
        }
      });
    }
  });

  return Object.keys(memo).every(parentName => memo[parentName] <= 1);
};

test.beforeEach(t => {
  t.context = Object.assign({ sequenceStacks }, {
    config: {},
    serverless: {
      config: {
        servicePath: __dirname
      }
    },
    provider: {},
    getStackName: () => 'test',
    nestedStacks: {
      stack1: {},
      stack2: {},
      stack3: {},
      stack4: {},
      stack5: {},
      stack6: {},
      stack7: {},
      stack8: {},
      stack9: {},
      stack10: {}
    },
    rootTemplate: {
      Resources: {
        stack1: {},
        stack2: {},
        stack3: {},
        stack4: {},
        stack5: {},
        stack6: {},
        stack7: {},
        stack8: {},
        stack9: {},
        stack10: {}
      }
    }
  });
});

test('does nothing if parallelDeployments is disabled', t => {
  t.context.config.stackSequence = false;

  t.context.sequenceStacks();

  t.is(0, countDependsOn(t.context.rootTemplate.Resources));
});

test('creates a single nested stack chain if enabled without parallel deployments', t => {
  t.context.config.stackSequence = true;

  t.context.sequenceStacks();

  t.is(9, countDependsOn(t.context.rootTemplate.Resources));
  t.true(doesNotBecomeCircular(t.context.rootTemplate.Resources));
});

test('keeps already existing dependsOn directives', t => {
  t.context.config.stackSequence = true;
  t.context.rootTemplate.Resources.stack9.DependsOn = ['Foo'];

  t.context.sequenceStacks();

  t.is(9, countDependsOn(t.context.rootTemplate.Resources));
  t.is(2, t.context.rootTemplate.Resources.stack9.DependsOn.length);
  t.true(doesNotBecomeCircular(t.context.rootTemplate.Resources));
});

test('creates multiple nested stack chains if enabled with parallel deployments', t => {
  t.context.config.stackSequence = true;
  t.context.config.stackParallelDeployments = 3;

  t.context.sequenceStacks();

  t.is(7, countDependsOn(t.context.rootTemplate.Resources));
  t.true(doesNotBecomeCircular(t.context.rootTemplate.Resources));
});
