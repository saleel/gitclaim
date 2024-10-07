import { generateEmailVerifierInputs } from "@mach-34/zkemail-nr";
import { type Noir, type CompiledCircuit, InputMap } from "@noir-lang/noir_js";
import {
  UltraHonkBackend,
  UltraHonkVerifier,
} from "@noir-lang/backend_barretenberg";

type ProverModules = {
  Noir: typeof Noir;
  UltraHonkBackend: typeof UltraHonkBackend;
  circuit: object;
};

type VerifierModules = {
  UltraHonkVerifier: typeof UltraHonkVerifier;
  vkey: number[];
};

let proverPromise: Promise<ProverModules> | null = null;
let verifierPromise: Promise<VerifierModules> | null = null;

export async function initProver(): Promise<ProverModules> {
  if (!proverPromise) {
    proverPromise = (async () => {
      const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
        import("@noir-lang/noir_js"),
        import("@noir-lang/backend_barretenberg"),
      ]);
      const circuit = await import("./assets/circuit.json");
      return { Noir, UltraHonkBackend, circuit: circuit.default };
    })();
  }
  return proverPromise;
}

export async function initVerifier(): Promise<VerifierModules> {
  if (!verifierPromise) {
    verifierPromise = (async () => {
      const { UltraHonkVerifier } = await import(
        "@noir-lang/backend_barretenberg"
      );
      const vkey = await import("./assets/circuit-vkey.json");
      return { UltraHonkVerifier, vkey: vkey.default };
    })();
  }
  return verifierPromise;
}

export async function generateProof(emailContent: string, walletAddress: string) {
  try {
    const zkEmailInputs = await generateEmailVerifierInputs(emailContent, {
      maxBodyLength: 8000,
      maxHeadersLength: 1280,
      shaPrecomputeSelector: "you authored the thread.<img",
    });

    const emailDetails = parseEmail(emailContent);
  
    // Pad domain to 64 bytes
    const prUrlPadded = new Uint8Array(64);
    prUrlPadded.set(Uint8Array.from(new TextEncoder().encode(emailDetails.prUrl)));
  
    const inputs = {
      ...zkEmailInputs,
      pull_request_url: Array.from(prUrlPadded).map((s) => s.toString()),
      pull_request_url_length: emailDetails.prUrl.length,
    };
    console.log("Generating proof with inputs:", inputs);

    const { Noir, UltraHonkBackend, circuit } = await initProver();

    // Initialize Noir JS
    const backend = new UltraHonkBackend(circuit as CompiledCircuit);
    const noir = new Noir(circuit as CompiledCircuit);

    // Generate witness and prove
    const startTime = performance.now();
    const { witness } = await noir.execute(inputs as InputMap);
    const proofResult = await backend.generateProof(witness);
    const provingTime = performance.now() - startTime;


    return { proof: proofResult.proof, provingTime };
  } catch (error) {
    console.error("Error generating proof:", error);
    throw new Error("Failed to generate proof");
  }
}

export function parseEmail(emlContent: string) {
  // Extract PR URL - between `"target": "` and `#event-`
  const prUrlMatch = emlContent.match(/"target": "(.*?)#event-/);
  const prUrl = prUrlMatch ? prUrlMatch[1] : '';

  // Parse repo name from PR URL
  const repoNameMatch = prUrl.match(/github\.com\/([^/]+\/[^/]+)/);
  const repoName = repoNameMatch ? repoNameMatch[1] : '';

  return {
    prUrl,
    repoName,
  };
}
