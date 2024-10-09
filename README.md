# GitClaim

A sample app on top of [zkemail.nr](https://github.com/zkemail/zkemail.nr/) to claim airdrops by proving Github contributions to eligible repos using PR merge notification emails.

This is only meant to be a learning app, or a starting point for building ZK Email apps in Noir. 


## Try it out

URL: https://gitclaim.netlify.app/

Find any PR merge notification email in your inbox, download it as .eml file, and upload it to the app.


## Running locally

To build the Noir circuit (asuming you have [Noir and a backend like bb installed](https://noir-lang.org/docs/getting_started/installation/)):

```
cd circuits
sh build.sh
```

This will compile the code and copy the generated circuit artifact and vkey to the app.


To run the app (a NextJs app)

```
cd app
yarn
yarn dev
```


## How it works

In this section, we will see how the Noir circuit is designed, what are the tradeoffs, and some of the known issues.

This sections assumes you have some knowledge on how ZKEmail works. If not read more [here](https://blog.aayushg.com/zkemail/#zk-proof-of-email-construction) and [here](https://prove.email/)

### Identifying PR merge notification emails
Given an email, how do we know it's a PR merge notification email from Github?

There is nothing specific about merging in the email subject. Here is a sample:
```
Subject: Re: [noir-lang/noir_rsa] chore: add release-please (PR #21)
```

We have the below text in the body:
```
...
Merged #220 into feat/circuit-tests.
...
```

However, one might receive the word `Merged` in other Github notification emails - for example, when someone replies to an issue created by you with the word `Merged`. So we cannot reliably say an email is a PR merge notification email just based on the presence of the word `Merged`.

Upon observation, something unique to PR merge notification emails is there is a schema JSON at the footer of the email that contains a URL with eventId for the key "target". Sample:
```
{
  ...
  "target": "https://github.com/noir-lang/noir_rsa/pull/21#event-145160848..",
  ...
}
```
If it was any other kind of notification email, "#event" would not be present. For example, for a PR approval noficiation email, this would be
```
"target": "https://github.com/noir-lang/noir_rsa/pull/21#pullrequestreview-123.."
```

But anyone can subscribe to a PR (you are auto subscribed if you review/comment on a PR), and they all receive a notification email when the PR is merged.

We also need to ensure that the prover is the author of the PR. If they are the author, then the email body would contain the below text
```
You are receiving this because you authored the thread.
```

So, in our circuit we going to perform both the above checks to ensure the email is a PR merge notification email from Github and the prover is the author of the PR.

This is simply by observation and might not be fool-proof.

### SHA precompute

We can precompute SHA-256 up to the portion of the email body that we want to read in circuit. In our case, we can precompute SHA up to the part "You are receiving this because you authored the thread."

This occur towards half of the email body which let us precompute the first half. This would have been difficult if we relied on the "Merged..." text because it occurs at the beginning of th body.

### Nullifier

We need to ensure one person cannot claim airdrop multiple times. For this we need a nullifier that is attributed to the prover. The airdrop issuer (a server or a smart contract) will save this nullifier and ensure the same nullifier is not used again.

Github PR merge notification email contains the email address of the author in the `CC: ` field. In our circuit, we use this email address to and hash it to produce the nullifier.

### Verification
The `repo_name` input in the circuit is made public. This will in the "public inputs" part of the proof along with the nullifier.

So during verification, the airdrop issuer will:
- check if the `repo_name` is one of the eligible repos
- ensure the nullifier has not been used
- store the nullifier
- issue the airdrop to the prover


To learn more, read the circuit code in [main.nr](./circuit/src/main.nr) and input generation code in[utils.ts](./app/utils.ts) which has comments to understand the flow.


### Limitations

- We rely on some hacks in the email to validate if the email is a PR merge notification email. This might not be fool-proof.
- You receive a merge notification only if the merge was made by someone else. For some repos (mostly internal teams), you might be merging the PR yourself once its approved by someone.
- We dont check if the PR is merged to master/main
- Since the nullifier is hash of the email adddress, it is possible to do a brute force / dictionary attack to find out the email address that has a given nullifier.

This is only intended to be a sample app, mainly to explain the strategies around idetifying emails by looking for unique elements, and potentially finding them towards the end of the body to do SHA precompute, and to explain the concept of nullifiers.
