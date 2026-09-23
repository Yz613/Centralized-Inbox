export type Schema = 'string' | 'boolean' | 'number' | `integer ${number}-${number}` | 'integer' | Schema[] | { [key: string]: Schema };
export interface DeviceAIRequest { task?: string; prompt?: string; instructions?: string; input?: unknown; imageDataUrl?: string; responseSchema?: Schema; localOnly?: boolean; needsCurrentInformation?: boolean; requiresTools?: string[] }
export type DeviceAIResult =
  | { status: 'local_success'; provider: 'apple-foundation-models' | 'gemini-nano'; model?: string; output: unknown; durationMs: number }
  | { status: 'local_failed'; reasonCode: string; reason: string }
  | { status: 'cloud_handoff_required'; reasonCode: string; reason: string; copyPrompt: string; suggestedDestination: 'either' };
export declare const deviceAI: { run(request: DeviceAIRequest): Promise<DeviceAIResult>; showHandoff(result: DeviceAIResult, target?: HTMLElement): HTMLElement };
export declare function decide(request: DeviceAIRequest, contextLimit?: number): {reasonCode:string;reason:string}|null;
export declare function createHandoff(request: DeviceAIRequest, reasonCode: string, reason: string): DeviceAIResult;
