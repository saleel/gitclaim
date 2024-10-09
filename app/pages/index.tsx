"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Head from "next/head";
import { useDropzone } from "react-dropzone";
import { generateProof, parseEmail, isEligibleRepo } from "../utils";

export default function Home() {
  const [emailContent, setEmailContent] = useState("");
  const [emailDetails, setEmailDetails] = useState<ReturnType<typeof parseEmail> | null>(null);
  const [proof, setProof] = useState<Uint8Array | null>(null);
  const [publicInputs, setPublicInputs] = useState<string[] | null>(null);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [walletAddress, setWalletAddress] = useState("0xab");
  const [provingTime, setProvingTime] = useState(0);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  const emailSectionRef = useRef<HTMLDivElement>(null);
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const proofSectionRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setEmailContent(content);
      
      // Reset all states
      setClaimStatus(null);
      setProof(null);
      setPublicInputs(null);
      setProvingTime(0);
      setIsGeneratingProof(false);

      const parsedEmail = parseEmail(content);
      setEmailDetails(parsedEmail);
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "message/rfc822": [".eml"],
    },
  });

  async function onGenerateProofClick() {
    setIsGeneratingProof(true);
    try {
      const { proof, publicInputs, provingTime } = await generateProof(
        emailContent,
        walletAddress
      );
      setProof(proof);
      setPublicInputs(publicInputs);
      setProvingTime(provingTime);
      console.log("Proof generated in", provingTime, "ms");
    } catch (error) {
      console.error("Error generating proof:", error);
    } finally {
      setIsGeneratingProof(false);
    }
  }

  async function onClaimDiscount() {
    try {
      setClaimStatus("Claiming airdrop...");
      const response = await fetch("/api/claim-airdrop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proof: Array.from(proof!),
          publicInputs,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setClaimStatus("Airdrop claimed successfully!");
      } else {
        setClaimStatus(`Failed to claim airdrop: ${data.message}`);
      }
    } catch (error) {
      console.error("Error claiming airdrop:", error);
      setClaimStatus("An error occurred while claiming the airdrop.");
    }
  }

  useEffect(() => {
    if (emailContent && detailsSectionRef.current) {
      detailsSectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [emailContent]);

  useEffect(() => {
    if (proof && proofSectionRef.current) {
      proofSectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [proof]);

  const renderEmailDropSection = () => (
    <section ref={emailSectionRef} className="section">
      <h2 className="section-title">Welcome to GitClaim</h2>
      <p>
        GitClaim is a tool for claiming airdrops by proving that you have
        contributed to an eligible Github repository.
      </p>
      <p>
        It works by parsing notification emails that Github sends when a PR is
        merged. We use{" "}
        <a
          href="https://github.com/zkemail/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ZK Email
        </a>{" "}
        to prove you have a matching email without revealing the full contents
        of the email. This way, your wallet address will not be linked to your
        Github account.
      </p>
      <p>
        To get started, upload a PR merge notification email that Github sends
        to you. You can download emails as .eml files from most email clients {" "}
        <a
          href="https://support.google.com/mail/answer/9261412"
          target="_blank"
          rel="noopener noreferrer"
        >
          including Gmail
        </a>
        .
      </p>
      <div className="dropzone" {...getRootProps()}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the .eml file here ...</p>
        ) : (
          <p>Drag the .eml file here, or click to select a file</p>
        )}
      </div>
      {emailDetails && !emailDetails?.repoName && (
        <p className="error-message">
          Unable to parse the email. Please upload a PR merge notification email
          from Github.
        </p>
      )}
    </section>
  );

  const isEligible = emailDetails && isEligibleRepo(emailDetails.repoName);
  const renderDetailsSection = () => (
    <section ref={detailsSectionRef} className="section">
      <h2 className="section-title">Email Details</h2>

      <p className="info-block">
        <span className="label">Repo name (public):</span>
        <span className="value">{emailDetails?.repoName}</span>
      </p>
      <p className="info-block">
        <span className="label">PR Number (private):</span>
        <span className="value">{emailDetails?.prNumber}</span>
      </p>
      <p className="info-block">
        <span className="label">Email (private):</span>
        <span className="value">{emailDetails?.ccEmail}</span>
      </p>
      {isEligible !== null && (
        <p className={`info-block ${isEligible ? '' : 'error'}`}>
          <span className="label">Eligibility:</span>
          <span className="value">{isEligible ? 'Eligible' : 'Not Eligible'}</span>
        </p>
      )}

      <div className="info-block">
        <label className="label" htmlFor="walletAddress">
          Wallet Address:
        </label>
        <input
          type="text"
          className="value section-input"
          id="walletAddress"
          value={walletAddress}
          disabled={isGeneratingProof || !walletAddress || !!(proof && publicInputs)}
          onChange={(e) => setWalletAddress(e.target.value)}
          maxLength={42}
          placeholder="Enter your wallet address"
        />
      </div>

      <button
        className={`section-button ${isGeneratingProof ? "generating" : ""}`}
        onClick={onGenerateProofClick}
        disabled={isGeneratingProof || !isEligible || !walletAddress || !!(proof && publicInputs)}
      >
        {isGeneratingProof ? (
          <>
            <span className="spinner"></span>
            Generating...
          </>
        ) : (
          "Generate Proof"
        )}
      </button>
      {isGeneratingProof && (
        <p className="info-message">
          Proof is being generated. This will take about a minute...
        </p>
      )}
      {proof && provingTime && (
        <p className="info-message">
          Proof generated in {provingTime / 1000} seconds
        </p>
      )}
    </section>
  );

  const renderProofSection = () => (
    <section ref={proofSectionRef} className="section">
      <h2 className="section-title">Proof Generated</h2>
      <p>Proof generated in {provingTime} ms</p>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <div className="proof-block">
          <p>Proof</p>
          <textarea
            value={Array.from(proof!).join(",")}
            readOnly
            className="section-input"
          />
        </div>
        <div className="proof-block">
          <p>Public Inputs</p>
          <textarea
            value={publicInputs?.join("\n")}
            readOnly
            className="section-input"
          />
        </div>
      </div>

      <button
        disabled={!!claimStatus && !(claimStatus?.includes("Failed") || claimStatus?.includes("error"))}
        className="section-button"
        onClick={onClaimDiscount}
      >
        Claim Airdrop
      </button>

      <p className={`info-message`}>{claimStatus}</p>
    </section>
  );

  return (
    <>
      <Head>
        <title>Github Proof</title>
      </Head>
      <div className="sections">
        {renderEmailDropSection()}
        {emailDetails?.repoName && renderDetailsSection()}
        {proof && renderProofSection()}
      </div>
    </>
  );
}
