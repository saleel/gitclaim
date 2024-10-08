import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyProof } from '../../utils';

type ResponseData = {
  success: boolean;
  message: string;
};

// In-memory storage for nullifiers (replace with a database in production)
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

    // Extract nullifier from public inputs
    const nullifier = publicInputs[0];

    // Check if nullifier has been used before
    if (usedNullifiers.has(nullifier)) {
      return res.status(400).json({ success: false, message: 'Airdrop already claimed' });
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