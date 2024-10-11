import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { config } from "./config";
import { ResourceSearchArgs, ResourceSearch } from "./resourceSearch";

const baseName = config.baseName 

///////////////
// Resources for Insights.
// Currently this is just an open search domain.

const resourceSearch = new ResourceSearch(`${baseName}-search`, {
  deployOpenSearch: config.enableOpenSearch,
  domainNname: config.openSearchDomainName,
  instanceType: config.openSearchInstanceType,
  instanceCount: config.openSearchInstanceCount,
  vpcId: config.vpcId,
  subnetIds: config.privateSubnetIds,
  dedicatedMasterCount: config.openSearchDedicatedMasterCount
});

export const openSearchDomainName = resourceSearch.domain
export const openSearchEndpoint = resourceSearch.endpoint
export const openSearchUser = resourceSearch.user
export const openSearchPassword = resourceSearch.password