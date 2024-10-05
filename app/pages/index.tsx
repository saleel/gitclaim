"use client";

import React, { useState, useCallback } from "react";
import Head from "next/head";
import { useDropzone } from "react-dropzone";
import { generateEmailVerifierInputs } from "@mach-34/zkemail-nr";
import { generateProof } from "../utils";

export default function Home() {
  const [emailContent, setEmailContent] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      setEmailContent(event.target?.result as string);
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "message/rfc822": [".eml"],
    },
  });

  async function onSubmit() {
    const inputs = await generateEmailVerifierInputs(emailContent, {
      maxBodyLength: 1280,
      maxHeadersLength: 1280,
      shaPrecomputeSelector: "you authored the thread.<img",
    });

    // Pad domain to 50 bytes
    const prUrl = new Uint8Array(64);
    prUrl.set(
      Uint8Array.from(
        new TextEncoder().encode(
          "https://github.com/zkemail/zk-email-verify/pull/220"
        )
      )
    );

    const inp = {
      ...inputs,
      pull_request_url: Array.from(prUrl).map((s) => s.toString()),
      pull_request_url_length:
        "https://github.com/zkemail/zk-email-verify/pull/220".length,
    };
    console.log("Generated inputs:", inp);

    console.log(new TextDecoder().decode(Uint8Array.from(inp.body?.map(s => Number(s)))))

    const { proof, provingTime } = await generateProof(inp);
    console.log("Proof:", proof);
    console.log("Proving time:", provingTime);
  }

  return (
    <>
      <Head>
        <title>StealthNote</title>
      </Head>

      <div className="page">
        <main className="intro">
          <h1 className="intro-title">Welcome to Github Proof</h1>

          <div className="dropzone" {...getRootProps()}>
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>Drop the .eml file here ...</p>
            ) : (
              <p>Drag and drop an .eml file here, or click to select a file</p>
            )}
          </div>

          {emailContent && (
            <p className="file-selected">
              File selected: {emailContent.substring(0, 20)}...
            </p>
          )}

          <button
            className="submit-button"
            onClick={onSubmit}
            disabled={!emailContent}
          >
            Generate Proof
          </button>
        </main>
      </div>
    </>
  );
}
