
import { OutputMap, LocalWorkspace, LocalProgramArgs, InlineProgramArgs, ConfigMap, Stack, PulumiFn } from "@pulumi/pulumi/automation";
import * as fs from "fs";

export interface PulumiDeploymentArgs {
    stackName: string;
    projectName?: string
    pulumiProgram?: PulumiFn;
    workDir?: string
}

/**
 * Wrapper which simplifies stack actions allowing inline and local projects to be orchestrated through Pulumi's lifecycle (up/destroy/outputs/etc)
 */
export class PulumiDeployment {
    readonly args: PulumiDeploymentArgs;
    readonly localArgs?: LocalProgramArgs;
    readonly inlineArgs?: InlineProgramArgs;

    constructor(args: PulumiDeploymentArgs) {

        if (args.workDir && (args.pulumiProgram || args.projectName)) {
            throw new Error("program and projectName must be empty if workdir is specified");
        }

        if (args.workDir) {
            if (!fs.existsSync(args.workDir)) {
                throw new Error(`provided work dir '${args.workDir}' does not exist`);
            }

            this.localArgs = {
                workDir: args.workDir,
                stackName: args.stackName
            };
        }
        else if (args.projectName && args.pulumiProgram) {
            this.inlineArgs = {
                stackName: args.stackName,
                program: args.pulumiProgram,
                projectName: args.projectName
            };
        }
        else {
            throw new Error("unrecognized configuration...");
        }

        this.args = args;
    }

    /**
     * Update the stack associated with this instance
     * @param map Pulumi config to be set for stack
     * @returns Outputs from stack
     */
    async update(map: ConfigMap): Promise<OutputMap> {
        const stack = await this.createOrSelectStack();

        await stack.setAllConfig(map);

        console.info

        const result = await stack.up({ onOutput: console.info });
        return result.outputs;
    }

    /**
     * Destroy the stack associated with this instance
     */
    async destroy() {
        const stack = await this.createOrSelectStack();

        console.info(`destroying stack ${this.args.stackName}...`)

        await stack.destroy({ onOutput: console.info });
    }

    /**
     * 
     * @returns Retrieve the outputs associated with this stack
     */
    async getOutputs(): Promise<OutputMap> {
        const stack = await this.createOrSelectStack();
        return stack.outputs();
    }

    /**
     * Unprotect all resources within the stack
     */
    async unprotectStateAll(): Promise<void> {
        const stack = await this.createOrSelectStack();

        const state = await stack.exportStack();
        for (const resource of state.deployment.resources) {
            resource.protect = false;
        }

        await stack.importStack(state);
    }

    /**
     * 
     * @returns Create or select an existing stack based on the args passed to the constructor. Only one of inline/local should be populated
     */
    private async createOrSelectStack(): Promise<Stack> {
        if (this.inlineArgs) {
            return await LocalWorkspace.createOrSelectStack(this.inlineArgs);
        }

        if (this.localArgs) {
            return await LocalWorkspace.createOrSelectStack(this.localArgs);
        }

        throw new Error("unrecognized stack args...");
    }
}