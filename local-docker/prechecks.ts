import * as pulumi from "@pulumi/pulumi";

const dockerConfig = new pulumi.Config("docker");
const dockerHost = dockerConfig.get("host");
if (dockerHost !== undefined) {
    console.log(
        "This Pulumi application must be run against `localhost`. \n"
        + "This Pulumi application writes to local files and mounts them into Docker containers. \n"
        + "Please remove `docker:host` from your stack configuration and try again. \n"
    );
    process.exit(1);
}
