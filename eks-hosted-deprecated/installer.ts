import { LocalWorkspace, ConfigMap, StackAlreadyExistsError, } from "@pulumi/pulumi/automation";

import * as child_process from "child_process";
import * as fs from "fs";
import * as process from "process";
import * as yargs from "yargs";

export const getArguments = function (validProjectPaths: string[]): ProgramArgs {
    const configFileOptName = "config-file";
    const configFileOpt: yargs.Options = {
        type: 'string',
        describe: `${configFileOptName} to use for project configuration`,
    };
    const projectOptName = "project";
    const projectOpt: yargs.Options = {
        type: 'string',
        describe: `the ${projectOptName} to target`,
        choices: validProjectPaths,
        default: validProjectPaths,
    };
    const messageOptName = "message";
    const messageOpt: yargs.Options = {
        type: 'string',
        describe: `${messageOptName} to associate with the operation`,
    };
    const yesOptName = "yes";
    const yesOpt: yargs.Options = {
        type: 'boolean',
        describe: `${yesOptName} to automatically continue with the operation`,
        alias: 'y',
    };

    const operationOptions = (yargs: yargs.Argv<{}>) => {
        yargs.options({
            [projectOptName]: projectOpt,
            [messageOptName]: messageOpt,
            [configFileOptName]: configFileOpt,
            [yesOptName]: yesOpt,
        })
            .demandOption(configFileOptName);
    };

    const args = yargs
        .usage('$0 <cmd> [args]')
        .command(`${INIT} [${projectOptName}]`, 'initialize the project stack(s)', (yargs) => operationOptions(yargs))
        .command(`${SET_CONFIG} [${projectOptName}]`, 'set configuration on the project stack(s)', (yargs) => operationOptions(yargs))
        .command(`${UPDATE} [${projectOptName}]`, 'update the project stack(s)', (yargs) => operationOptions(yargs))
        .command(`${DESTROY} [${projectOptName}]`, 'destroy the project stack(s)', (yargs) => operationOptions(yargs))
        .command(`${UNPROTECT_ALL} [${projectOptName}]`, 'unprotect resources in the project stack(s)', (yargs) => operationOptions(yargs))
        .demandCommand(1)
        .strict()
        .wrap(120)
        .help()
        .argv;

    return {
        configFilePath: <string>args[configFileOptName],
        operation: args._[0], 
        operationMessage: <string>args.message,
        projects: <string[]>args.project,
        yes: <boolean>args.yes,
    };
};

export const run = async (args: RunArgs) => {
    try {
        if (args.operation === INIT) {
            await init(args.projects);
        }
        else if (args.operation === SET_CONFIG) {
            await setConfig(args.projects);
        }
        else if (args.operation === UPDATE) {
            await update(args.projects, args.operationMessage);
        }
        else if (args.operation === DESTROY) {
            // reverse order for `destroy`
            await destroy(args.projects.reverse(), args.operationMessage);
        }
        else if (args.operation === UNPROTECT_ALL) {
            // reverse order is not necessary, but likely what users expect
            await unprotectAll(args.projects.reverse());
        }

    }
    catch (err) {
        log(`An error occurred: ${err}`);
        process.exit(1);
    }
}

export const init = async function (projects: Project[]) {
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];

        bannerStart(`Initializing stack [${currentProject.workDir}/${currentProject.stackName}]... `);
        // TODO: do something with the result here
        try {
            const stack = await LocalWorkspace.createStack({
                workDir: currentProject.workDir,
                stackName: currentProject.stackName,
            });
        }
        catch (err) {
            if (!(err instanceof StackAlreadyExistsError)) {
                throw err;
            }
            else {
                log(`stack already exists, continuing... `, true);
            }
        }
        bannerEnd("Done.");
    }
};

export const setConfig = async function (projects: Project[]) {
    // do the thing
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];

        bannerStart(`Setting configuration on [${currentProject.workDir}/${currentProject.stackName}]... `);

        const stack = await LocalWorkspace.selectStack({
            workDir: currentProject.workDir,
            stackName: currentProject.stackName,
        });

        await stack.setAllConfig(currentProject.config);

        bannerEnd("Done.");
    }
};
/**
 * TODO: add a banner about estimated time - e.g. 35-45 minutes.
 */
export const update = async function (projects: Project[], operationMessage?: string) {
    // install dependencies first and fail fast if needed
    installDependencies(projects);

    // do the thing
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];

        const stack = await LocalWorkspace.selectStack({
            workDir: currentProject.workDir,
            stackName: currentProject.stackName,
        });

        bannerStart(`Running [update] on [${currentProject.workDir}/${currentProject.stackName}]... `);

        await stack.setAllConfig(currentProject.config);

        // TODO: do something with the result here
        const status = await stack.up({
            message: operationMessage,
            onOutput: log,
        });
        bannerEnd("Done.");
    }
};

/**
 * TODO: add a banner about estimated time - e.g. XYZ minutes.
 */
export const destroy = async function (projects: Project[], operationMessage?: string) {
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];

        const stack = await LocalWorkspace.selectStack({
            workDir: currentProject.workDir,
            stackName: currentProject.stackName,
        });

        bannerStart(`Running [destroy] on [${currentProject.workDir}/${currentProject.stackName}]... `);
        // TODO: do something with the result here
        const status = await stack.destroy({
            message: operationMessage,
            onOutput: log,
        });
        bannerEnd("Done.");
    }
};

export const unprotectAll = async function (projects: Project[]) {
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];

        /**
         * Using child_process until the following features are available:
         * - https://github.com/pulumi/pulumi/issues/5531 - e.g. pulumi stack export
         * - https://github.com/pulumi/pulumi/issues/5755 - e.g. pulumi state unprotect
         */
        const cmd = `pulumi state unprotect -s ${currentProject.stackName} --all --yes`;
        const cwd = currentProject.workDir;

        bannerStart(`Running [${cmd}] on [${cwd}/${currentProject.stackName}]... `);
        child_process.execSync(cmd, { cwd: cwd });
        bannerEnd("Done.");
    }
};

export const installDependencies = function (projects: Project[]) {
    bannerStart(`Installing dependencies... `);
    for (let i = 0; i < projects.length; i++) {
        const currentProject = projects[i];
        installDependenciesForProject(currentProject.workDir);
    }
    bannerEnd("Done.");
};

export const installDependenciesForProject = function (path: string) {
    if (fs.existsSync(`${path}/node_modules`)) {
        log(`Skipping dependency installation for [${path}] (node_modules already present).`);
        return;
    }

    const cmd = 'npm install';
    log(`Running [${cmd}] for [${path}]...`);
    child_process.execSync(cmd, { cwd: path });
    logDone();
};

export const log = function (message: string, noNewline?: boolean) {
    // try to remove empty lines between resource specific messages - e.g. ` ++ aws:ec2:Subnet main creating ...`
    if (message.match('[ ]+[+\-~]*[ ]+.*:.*:.* ') !== null) {
        message = message.trimEnd();
    }

    process.stdout.write(message);
    // don't print a newline for progress indicator (eg. '.')
    if (!noNewline && message !== '.') {
        process.stdout.write('\n');
    }
};

export const logDone = function () {
    log(`Done.`);
};

export const bannerStart = function (message?: string) {
    log(``);
    log(`########################################`);
    log(`# `);
    log(`# ${message} `);
    log(`# `);
    log(``);
};

export const bannerEnd = function (message?: string) {
    log(``);
    log(`# `);
    log(`# ${message} `);
    log(`# `);
    log(`########################################`);
};

export const INIT = "init";
export const SET_CONFIG = "set-config";
export const UPDATE = "update";
export const DESTROY = "destroy";
export const UNPROTECT_ALL = "unprotect-all";

export const ALLOWED_OPERATIONS = [
    INIT,
    UPDATE,
    DESTROY,
    UNPROTECT_ALL,
];

export interface Project {
    workDir: string;
    stackName: string;
    config: ConfigMap;
};

export interface ProgramArgs {
    configFilePath: string;
    operation: string | number;
    operationMessage?: string;
    projects: string[];
    yes: boolean;
}

export interface RunArgs {
    operation: string | number;
    operationMessage?: string;
    projects: Project[];
}
