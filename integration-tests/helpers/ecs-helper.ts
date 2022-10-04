import { Config } from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";

export const pulumiProgram = async () => {
    const config = new Config();

    const vpc = new awsx.ec2.Vpc("vpc", {
        cidrBlock: "10.100.0.0/24"
    });

    return {
        vpcId: vpc.id,
        publicSubnetIds: vpc.publicSubnetIds,
        privateSubnetIds: vpc.privateSubnetIds,
        isolatedSubnetIds: vpc.isolatedSubnetIds
    };
};