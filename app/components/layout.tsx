import React from "react";

function Header() {
  return (
    <header className="navbar">
      <div className="logo">
        GitClaim
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="container">{children}</div>
    </>
  )
}