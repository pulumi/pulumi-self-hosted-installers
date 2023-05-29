
import { SSM } from "@aws-sdk/client-ssm";
import { route53, acm, } from "@pulumi/aws";

export const getLicenseKey = async (region: string): Promise<string> => {
    const ssm = new SSM({ region });
    const key = await ssm.getParameter({ Name: "ce-selfhosted-test-license-key", WithDecryption: true });
    return key.Parameter?.Value!;
};

export const acmCertificateCreate = async (zoneName: string, domainName: string): Promise<acm.Certificate> => {
    // create cert
    const zone = await route53.getZone({
        name: zoneName
    });

    const cert = new acm.Certificate("cert", {
        domainName: `*.${domainName}`,
        validationMethod: "DNS"
    });

    const { resourceRecordName, resourceRecordValue, resourceRecordType } = cert.domainValidationOptions[0];
    const record = new route53.Record("cert-record", {
        name: resourceRecordName,
        records: [resourceRecordValue],
        type: resourceRecordType,
        zoneId: zone.id,
        ttl: 60
    });

    new acm.CertificateValidation("cert-validation", {
        certificateArn: cert.arn,
        validationRecordFqdns: [record.fqdn]
    });

    return cert;
};