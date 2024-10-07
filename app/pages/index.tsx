"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Head from "next/head";
import { useDropzone } from "react-dropzone";
import { generateProof, parseEmail } from "../utils";

export default function Home() {
  const [emailContent, setEmailContent] = useState("");
  const [emailDetails, setEmailDetails] = useState<{
    repoName: string;
    prUrl: string;
  } | null>(null);
  const [proof, setProof] = useState<Uint8Array | null>(null);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  const emailSectionRef = useRef<HTMLDivElement>(null);
  const detailsSectionRef = useRef<HTMLDivElement>(null);
  const proofSectionRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setEmailContent(content);
      const details = parseEmail(content);
      console.log("Email details:", details);
      setEmailDetails(details);
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
      const { proof, provingTime } = await generateProof(
        emailContent,
        walletAddress
      );
      setProof(proof);
      console.log("Proof generated in", provingTime, "ms");
    } catch (error) {
      console.error("Error generating proof:", error);
    } finally {
      setIsGeneratingProof(false);
    }
  }

  function onClaimDiscount() {
    console.log("Claiming discount with proof:", proof);
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
        merged.
        <p></p>
        We use{" "}
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
        to you. You can download emails as .eml files from most email clients
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
      {emailContent && !emailDetails?.prUrl && (
        <p className="error-message">
          Unable to parse the email. Please upload a PR merge notification email
          from Github.
        </p>
      )}
    </section>
  );

  const renderDetailsSection = () => (
    <section ref={detailsSectionRef} className="section">
      <h2 className="section-title">Email Details</h2>
      <p>Repository: {emailDetails?.repoName}</p>
      <p>Pull Request: {emailDetails?.prUrl}</p>

      <div className="wallet-input">
        <label htmlFor="walletAddress">Wallet Address:</label>
        <input
          type="text"
          className="section-input"
          id="walletAddress"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="Enter your wallet address"
        />
      </div>

      <button
        className={`generate-proof-button ${
          isGeneratingProof ? "generating" : ""
        }`}
        onClick={onGenerateProofClick}
        disabled={isGeneratingProof || !walletAddress}
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
          Proof is being generated. This may take a few minutes...
        </p>
      )}
    </section>
  );

  const renderProofSection = () => (
    <section ref={proofSectionRef} className="section">
      <h2 className="section-title">Proof Generated</h2>
      <button className="claim-discount-button" onClick={onClaimDiscount}>
        Claim Discount
      </button>
    </section>
  );

  return (
    <>
      <Head>
        <title>Github Proof</title>
      </Head>
      <div className="sections">
        {renderEmailDropSection()}
        {emailDetails?.prUrl && renderDetailsSection()}
        {proof && renderProofSection()}
      </div>
    </>
  );
}
