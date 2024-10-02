import * as readline from "readline-sync";
import * as installer from "./installer";

import * as fs from "fs";
import * as yaml from "js-yaml";

interface SelfHostedConfig {
    region: string;
    licenseFilePath: string;
    route53Zone: string;
    route53Subdomain: string;
    imageTag: string;

    smtpServer: string;
    smtpUsername: string;
    smtpPassword: string;
    smtpGenericSender: string;

    recaptchaSiteKey: string;
    recaptchaSecretKey: string;

    samlSsoEnabled: string;

    consoleHideEmailSignup: string;
    consoleHideEmailLogin: string;
    apiDisableEmailSignup: string;
    apiDisableEmailLogin: string;

    clusterConfig: any;
    clusterServicesConfig: any;
    appsConfig: any;
};

const checkPrerequisites = function (config: SelfHostedConfig) {
    if (!config.region) {
        throw Error(`[region] is a required configuration property.`);
    }
    if (!config.licenseFilePath) {
        throw Error(`[licenseFilePath] is a required configuration property.`);
    }
    if (!config.route53Zone) {
        throw Error(`[route53Zone] is a required configuration property.`);
    }
    if (!config.route53Subdomain) {
        throw Error(`[route53Subdomain] is a required configuration property.`);
    }
    if (!config.imageTag) {
        throw Error(`[imageTag] is a required configuration property.`);
    }
    if (!config.clusterConfig.stackName) {
        throw Error(`[clusterConfig -> stackName] is a required configuration property.`);
    }
    if (!config.clusterServicesConfig.stackName) {
        throw Error(`[clusterServicesConfig -> stackName] is a required configuration property.`);
    }
    if (!config.appsConfig.stackName) {
        throw Error(`[appsConfig -> stackName] is a required configuration property.`);
    }
}

/**
 * Handle CTRL+C. 
 */
process.on('SIGINT', () => {
    console.log('');
    console.log('****************************************');
    console.log('`pulumi` processes may still be running.');
    console.log('You can wait for them to finish or kill them and re-run pulumi to recover.');
    console.log('****************************************');
});

export const run = async () => {

    const projectClusterConfigPath = "01-cluster-configuration";
    const projectClusterServicesPath = "02-cluster-services";
    const projectAppsPath = "03-apps";

    /**
     * Slight chicken-and-egg issue that we want yargs to know our available projects, 
     * but also need yargs to get our `--config-file` argument, hence the extra array here.
     * Opportunity to improve in the future...
     */
    const projectPaths = [
        projectClusterConfigPath,
        projectClusterServicesPath,
        projectAppsPath,
    ];

    const args = installer.getArguments(projectPaths);

    let config;
    try {
        const fileContents = fs.readFileSync(args.configFilePath, 'utf8');
        config = <SelfHostedConfig>yaml.safeLoad(fileContents);
        checkPrerequisites(config);
    }
    catch (err) {
        console.log(`Error while loading [${args.configFilePath}]: ${err}`);
        process.exit(1);
    }

    const projectClusterConfig: installer.Project = {
        workDir: projectClusterConfigPath,
        stackName: config.clusterConfig.stackName,
        config: {
            ...config.clusterConfig,
            "aws:region": { value: config.region },
        },
    };

    const projectClusterServices: installer.Project = {
        workDir: projectClusterServicesPath,
        stackName: config.clusterServicesConfig.stackName,
        config: {
            "aws:region": { value: config.region },
            "clusterStackRef": { value: config.clusterConfig.stackName },
            "hostedZoneDomainName": { value: config.route53Zone },
            ...config.clusterServicesConfig,
        },
    };

    let smtpConfig = {}
    if ((config.smtpServer) && (config.smtpUsername) && (config.smtpPassword) && (config.smtpGenericSender)) {
        smtpConfig = {
            smtpServer: { value: config.smtpServer },
            smtpUsername: { value: config.smtpUsername },
            smtpPassword: {
                secret: true,
                value: config.smtpPassword
            },
            smtpGenericSender: { value: config.smtpGenericSender},
        }
    }
    let recaptchaConfig = {}
    if ((config.recaptchaSiteKey) && (config.recaptchaSecretKey)) {
        recaptchaConfig = {
            recaptchaSiteKey: { value: config.recaptchaSiteKey},
            recaptchaSecretKey: { secret: true, value: config.recaptchaSecretKey }
        }
    }

    const emailLoginSignupSettings = {
        consoleHideEmailSignup: { value: config.consoleHideEmailSignup },
        consoleHideEmailLogin: { value: config.consoleHideEmailLogin },
        apiDisableEmailSignup: { value: config.apiDisableEmailSignup },
        apiDisableEmailLogin: { value: config.apiDisableEmailLogin }
    }

    const projectApps: installer.Project = {
        workDir: projectAppsPath,
        stackName: config.appsConfig.stackName,
        config: {
            ...config.appsConfig,
            "aws:region": { value: config.region },
            "clusterStackRef": { value: config.clusterConfig.stackName },
            "clusterSvcsStackRef": { value: config.clusterServicesConfig.stackName },
            "hostedZoneDomainName": { value: config.route53Zone },
            "hostedZoneDomainSubdomain": { value: config.route53Subdomain },
            "imageTag": { value: config.imageTag },
            "samlSsoEnabled": { value: config.samlSsoEnabled },
            "licenseKey": {
                secret: true,
                value: fs.readFileSync(config.licenseFilePath).toString(),
            },
            ...smtpConfig,
            ...recaptchaConfig,
            ...emailLoginSignupSettings,
        },
    };

    const projectInOrder: installer.Project[] = [
        projectClusterConfig,
        projectClusterServices,
        projectApps,
    ];

    const targetedProjects = projectInOrder.filter(it => args.projects.includes(it.workDir));

    const runArgs: installer.RunArgs = {
        operation: args.operation,
        operationMessage: args.operationMessage,
        projects: targetedProjects,
    };

    console.log(`Using the configuration data from [${args.configFilePath}]:`);
    console.log(config);
    if (Object.keys(smtpConfig).length == 0) {
        console.log("Warning: Missing one or more SMTP settings. Pulumi service will launch without email service enabled.")
    }
    console.log(``);

    if (!args.yes) {
        console.log(`Continuing will run [${args.operation}] on:`);
        targetedProjects.forEach(it => console.log(`- ${it.workDir}`));
        console.log(``);
        const response = readline.question('Enter [yes] to continue: ');
        if (response !== 'yes') {
            console.log('Canceled.');
            process.exit(0);
        }
    }

    installer.run(runArgs);

}

run();
