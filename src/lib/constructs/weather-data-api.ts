import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as nodejslambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as config from '../../config/config.json';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';

// Read-only API over the weather forecast history table, see src/lambda/weather/weather-data-api-lambda.ts
export class WeatherDataAPI extends Construct {

    constructor(scope: Construct, id: string, errorLogNotifierLambda: lambda.Function, forecastHistoryTable: dynamodb.Table) {
        super(scope, id);

        const logGroup = new logs.LogGroup(this, id + "-AccessLogs", {
            retention: logs.RetentionDays.ONE_YEAR
        });

        const api = new apigateway.RestApi(this, id + "-API", {
            restApiName: "Weather Data API",
            description: "Read-only access to aggregated and per-source hourly/daily weather forecast history",
            deployOptions: {
                metricsEnabled: true,
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                // Full request/response logging would log the x-api-key header
                dataTraceEnabled: false,
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
                // Basic protection against runaway callers (the data only changes every 30 minutes)
                throttlingRateLimit: 5,
                throttlingBurstLimit: 10
            }
        });

        const lambdaFunction = new nodejslambda.NodejsFunction(this, id + '-Lambda', {
            functionName: 'WeatherDataApiLambdaFunction',
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: __dirname + '/../../lambda/weather/weather-data-api-lambda.ts',
            handler: 'handler',
            environment: {
                REGION: config.base.region,
                FORECAST_HISTORY_TABLE_NAME: forecastHistoryTable.tableName,
                API_KEY_SECRET_WEATHER_DATA_API: config.weatherAlert.apiKeySecretWeatherDataApi,
            },
            memorySize: 256,
            timeout: cdk.Duration.seconds(10),
            logGroup: new logs.LogGroup(this, id + '-LambdaLogGroup', {
                logGroupName: id + '-LambdaLogGroup',
                retention: logs.RetentionDays.ONE_YEAR
            })
        });
        forecastHistoryTable.grantReadData(lambdaFunction);
        lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [`arn:aws:secretsmanager:${config.base.region}:${cdk.Stack.of(this).account}:secret:${config.weatherAlert.apiKeySecretWeatherDataApi}-*`],
            effect: iam.Effect.ALLOW,
        }));
        // Stream logs to the error notifier
        lambdaFunction.logGroup.addSubscriptionFilter(id + '-LambdaFunctionLogSubscription', {
            destination: new destinations.LambdaDestination(errorLogNotifierLambda),
            filterPattern: logs.FilterPattern.anyTerm('ERROR')
        });

        const integration = new apigateway.LambdaIntegration(lambdaFunction);
        for (const path of ['forecast', 'hourly', 'daily', 'sources']) {
            api.root.addResource(path).addMethod('GET', integration);
        }
    }
}
