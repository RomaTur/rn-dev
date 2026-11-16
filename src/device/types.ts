export type InspectorIdentity = {name:string};
export type PhotoAsset = {fileName:string;uri:string;width:number;height:number};
export type PdfAsset = {fileName:string;uri:string};
export type NativeReportDocument = {
 passport:{label:string;value:string}[];
 measurements:{label:string;measured:string;expected:string}[];
 criteria:{group:string;title:string;status:'pending'|'pass'|'fail';findings:string;comment:string}[];
 conclusion:string;
 decision:string;
 notice:string;
};
export type NativeReportInput = {
 title:string;
 lines:string[];
 photos:{fileName:string;caption:string;group:string}[];
 document:NativeReportDocument;
};
export interface WoodlandDevicePort {
 getIdentity():Promise<InspectorIdentity|null>;
 createIdentity(name:string,pin:string):Promise<InspectorIdentity>;
 unlock(pin:string):Promise<InspectorIdentity>;
 lock():Promise<void>;
 capturePhoto():Promise<PhotoAsset|null>;
 pickDate(initial:string):Promise<string|null>;
 createPdf(input:string):Promise<PdfAsset>;
 openReport(fileName:string):Promise<void>;
 shareReport(fileName:string):Promise<void>;
 printReport(fileName:string):Promise<void>;
}
