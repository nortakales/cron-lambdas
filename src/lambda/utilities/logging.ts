
export function startLambdaLog(event: any, context: any, env: any) {
    console.log("Running --------------------");
    console.log("EVENT\n" + JSON.stringify(event, null, 2));
    console.log("CONTEXT\n" + JSON.stringify(context, null, 2));
    console.log("ENVIRONMENT VARIABLES\n" + JSON.stringify(env, null, 2)
        // Some environment variables include the text "ERROR" which triggers our error notifier
        .replace(/ERROR/g, 'lowercased-error'));
}
