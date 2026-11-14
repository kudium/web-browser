# Security policy

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** option when it is available on this
repository. Otherwise email **hello@kudium.com** with the subject
**Kudium security report**. Do not publish exploit details or sensitive data in
public issues, pull requests, or discussions before coordinated disclosure.

Include the affected version or commit, operating system, reproduction steps,
expected and observed behavior, and the security impact. Use disposable accounts
and synthetic data. Never include passwords, private keys, session cookies,
recovery keys, or production user data. Ask for a secure transfer method if your
report requires sensitive supporting material.

We will assess reports and coordinate remediation and disclosure with the
reporter. This policy does not promise a response deadline or a bug bounty.

## Supported versions

Security fixes target the latest stable desktop release and the current deployed
web service. Older desktop versions should update to the latest stable release.
Beta releases are previews and should also stay current.

## Testing boundaries

Prefer local development environments and disposable profiles. Do not access
other users' data, disrupt services, send unsolicited messages, or test production
systems without explicit authorization from Kudium.

## Scope and limitations

Relevant areas include Electron isolation and IPC, website permissions, hooks
and extensions, AI action authorization, credential storage, account authentication,
cloud sync, and installer/update integrity. Source publication is not a security
certification. Existing reviews and regression evidence describe their stated
scope; they do not prove all attack paths are closed.
