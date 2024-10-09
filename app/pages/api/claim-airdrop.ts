import type { NextApiRequest, NextApiResponse } from 'next';
import { isEligibleRepo, verifyProof } from '../../utils';

type ResponseData = {
  success: boolean;
  message: string;
};

// WARNING!
// In-memory storage for nullifiers
// This will be reset during every server restart
// Replace with a database for actual use
const usedNullifiers = new Set<string>();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { proof, publicInputs } = req.body;

  if (!proof || !publicInputs) {
    return res.status(400).json({ success: false, message: 'Missing proof or public inputs' });
  }

  try {
    // Verify the proof
    const isValid = await verifyProof(proof, publicInputs);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid proof' });
    }

    // Construct the repo URL string from the first 50 bytes of publicInputs
    const repoUrlBytes = publicInputs.slice(0, 50);
    const repoUrl = repoUrlBytes.map((byte: number) => String.fromCharCode(byte)).join('').trim();

    // Check if the repo is eligible
    if (!isEligibleRepo(repoUrl)) { 
      return res.status(403).json({ success: false, message: 'Repository is not eligible for the airdrop' });
    }

    // Extract nullifier from public inputs
    const nullifier = publicInputs[50];

    // Check if nullifier has been used before
    if (usedNullifiers.has(nullifier)) {
      return res.status(400).json({ success: false, message: 'User already claimed the airdrop (nullifier found)' });
    }

    // Store the nullifier
    usedNullifiers.add(nullifier);

    // Airdrop claimed successfully
    return res.status(200).json({ success: true, message: 'Airdrop claimed successfully' });
  } catch (error) {
    console.error('Error claiming airdrop:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}