#!/usr/bin/env node
// import * as cdk from '@aws-cdk/core';
import { App } from 'aws-cdk-lib';
import { CDKPipelineStack } from '../lib/pipeline-stack';

const app = new App();
new CDKPipelineStack(app, 'CronLambdasCDKPipelineStack');
