#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { CDKPipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();
new CDKPipelineStack(app, 'CronLambdasCDKPipelineStack');
