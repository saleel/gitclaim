import { CompiledCircuit, InputMap, Noir } from "@noir-lang/noir_js";
import {
  UltraHonkBackend,
  UltraHonkVerifier,
} from "@noir-lang/backend_barretenberg";
import circuit from "./assets/circuit.json";

export async function generateProof(
  inputs: object
): Promise<{ proof: Uint8Array; provingTime: number }> {
  // Initialize Noir JS
  const backend = new UltraHonkBackend(circuit as CompiledCircuit);
  const noir = new Noir(circuit as CompiledCircuit);

  // Generate witness and prove
  const startTime = performance.now();
  const { witness } = await noir.execute(inputs as InputMap);
  const proof = await backend.generateProof(witness);
  const provingTime = performance.now() - startTime;

  console.log("Proof", proof);

  return { proof: proof.proof, provingTime };
}