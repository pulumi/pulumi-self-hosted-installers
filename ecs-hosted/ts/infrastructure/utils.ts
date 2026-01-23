export const getIamPolicyArn = (region: string, policyArn: string): string => {
    let policy = policyArn;

    const regionLower = region.toLocaleLowerCase();
    if (regionLower === "us-gov-west-1" || regionLower === "us-gov-east-1") {
        const splits = policyArn.split(":");
        splits[1] = "aws-us-gov";

        policy = splits.join(":");
    }

    return policy;
}