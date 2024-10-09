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

// Lazy load prover libs to avoid initial page load delay
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

export function parseEmail(emlContent: string) {
  // Extract PR URL - between `"target": "` and `#event-`
  const targetUrlMatch = emlContent.match(/"target": "(.*?)event-/);
  const targetUrl = targetUrlMatch ? targetUrlMatch[1] : "";

  // Parse repo name from PR URL
  const repoNameMatch = targetUrl.match(/https:\/\/github\.com\/(.*?)\/pull\//);
  const repoName = repoNameMatch ? repoNameMatch[1] : "";

  const prNumberMatch = targetUrl.match(/\/pull\/(.*?)#/);
  const prNumber = prNumberMatch ? prNumberMatch[1] : "";

  const ccEmailMatch = emlContent.match(/Cc: (.*),/);
  const ccEmail = ccEmailMatch ? ccEmailMatch[1] : "";

  return {
    repoName,
    prNumber,
    ccEmail,
  };
}

export async function generateProof(
  emailContent: string,
  walletAddress: string
) {
  try {
    const walletAddressField = BigInt(walletAddress).toString();

    // Generate common inputs using ZK Email SDK
    const zkEmailInputs = await generateEmailVerifierInputs(emailContent, {
      maxBodyLength: 1280, // Same as MAX_PARTIAL_EMAIL_BODY_LENGTH in circuit
      maxHeadersLength: 1408, // Same as MAX_EMAIL_HEADER_LENGTH in circuit
      shaPrecomputeSelector: "you authored the thread.<img", // <img to pick the one in html part
    });

    const emailDetails = parseEmail(emailContent);

    // Pad repo name to 50 bytes
    const repoNamePadded = new Uint8Array(50);
    repoNamePadded.set(
      Uint8Array.from(new TextEncoder().encode(emailDetails.repoName))
    );

    // Pad pr number to 6 bytes
    // We need this to compute the "target": url
    const prNumberPadded = new Uint8Array(6);
    prNumberPadded.set(
      Uint8Array.from(new TextEncoder().encode(emailDetails.prNumber))
    );

    // Pad email address to 60 bytes
    const emailAddressPadded = new Uint8Array(60);
    emailAddressPadded.set(
      Uint8Array.from(new TextEncoder().encode(emailDetails.ccEmail))
    );

    // Partial body padded
    const partialBodyPadded = new Array(1280).fill(0);
    for (let i = 0; i < zkEmailInputs.body!.length; i++) {
      partialBodyPadded[i] = zkEmailInputs.body![i];
    }

    const headerPadded = new Array(1408).fill(0);
    for (let i = 0; i < zkEmailInputs.header.length; i++) {
      headerPadded[i] = zkEmailInputs.header[i];
    }

    const inputs = {
      ...zkEmailInputs,
      header: headerPadded,
      header_length: zkEmailInputs.header_length,
      partial_body: Array.from(partialBodyPadded).map((s) => s.toString()),
      partial_body_length: zkEmailInputs.partial_body_length,
      full_body_length: zkEmailInputs.body_length,
      partial_body_hash: zkEmailInputs.partial_body_hash,
      body_hash_index: zkEmailInputs.body_hash_index,
      pubkey: zkEmailInputs.pubkey,
      pubkey_redc: zkEmailInputs.pubkey_redc,
      signature: zkEmailInputs.signature,
      repo_name: Array.from(repoNamePadded).map((s) => s.toString()),
      repo_name_length: emailDetails.repoName.length,
      pr_number: Array.from(prNumberPadded).map((s) => s.toString()),
      pr_number_length: emailDetails.prNumber.length,
      email_address: Array.from(emailAddressPadded).map((s) => s.toString()),
      email_address_length: emailDetails.ccEmail.length,
      wallet_address: walletAddressField,
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

    return { ...proofResult, provingTime };
  } catch (error) {
    console.error("Error generating proof:", error);
    throw new Error("Failed to generate proof");
  }
}

export async function verifyProof(
  proof: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  await initVerifier();

  const { UltraHonkVerifier, vkey } = await initVerifier();

  const proofData = {
    proof: proof,
    publicInputs,
  };

  const verifier = new UltraHonkVerifier({ crsPath: process.env.TEMP_DIR });
  const result = await verifier.verifyProof(proofData, Uint8Array.from(vkey));

  return result;
}

export function isEligibleRepo(repoName: string): boolean {
  // This can be updated to check against a list of eligible repos
  // return repoName.includes("noir-lang") || repoName.includes("AztecProtocol");

  return true;
}
