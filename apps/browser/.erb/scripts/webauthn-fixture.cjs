// Disposable virtual credentials only. Signature verification runs outside the
// website renderer, as it would at the relying party; no system keys are read.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

module.exports = async function verifyVirtualWebAuthn(web, origin) {
  const rpId = new URL(origin).hostname;
  await web.loadURL(origin + '/webauthn');
  web.debugger.attach('1.3');
  let authenticatorId;
  let stage = 'setup';
  const selectFixtureAccount = (_event, details, callback) => {
    const account = details.accounts.find(
      (entry) => entry.name === 'fixture-user'
    );
    callback(account?.credentialId);
  };
  web.session.on('select-webauthn-account', selectFixtureAccount);
  try {
    await web.debugger.sendCommand('WebAuthn.enable');
    ({ authenticatorId } = await web.debugger.sendCommand(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      }
    ));
    const registrationChallenge = crypto.randomBytes(32);
    stage = 'registration';
    const registration = await web.executeJavaScript(
      `(async()=>{
      if(!isSecureContext || !window.PublicKeyCredential) throw new Error('WebAuthn unavailable');
      const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const credential=await navigator.credentials.create({publicKey:{
        challenge:new Uint8Array(${JSON.stringify([...registrationChallenge])}),
        rp:{id:${JSON.stringify(rpId)},name:'Kudium test'},
        user:{id:new Uint8Array([1,2,3,4]),name:'fixture-user',displayName:'Fixture user'},
        pubKeyCredParams:[{type:'public-key',alg:-7}],
        authenticatorSelection:{residentKey:'required',userVerification:'required'},timeout:10000,
      }});
      window.fixtureCredential=credential;
      return {id:credential.id,type:credential.type,client:encode(credential.response.clientDataJSON),publicKey:encode(credential.response.getPublicKey())};
    })()`,
      true
    );
    const client = JSON.parse(
      Buffer.from(registration.client, 'base64').toString('utf8')
    );
    assert.equal(registration.type, 'public-key');
    assert.equal(client.type, 'webauthn.create');
    assert.equal(client.origin, origin);
    assert.equal(client.challenge, registrationChallenge.toString('base64url'));
    const { credentials } = await web.debugger.sendCommand(
      'WebAuthn.getCredentials',
      { authenticatorId }
    );
    assert.equal(credentials.length, 1);
    assert(credentials[0].isResidentCredential);
    const key = crypto.createPublicKey(
      crypto.createPrivateKey({
        key: Buffer.from(credentials[0].privateKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
      })
    );
    assert.deepEqual(
      key.export({ format: 'der', type: 'spki' }),
      Buffer.from(registration.publicKey, 'base64')
    );

    const challenge = crypto.randomBytes(32);
    stage = 'discoverable authentication';
    const assertion = await web.executeJavaScript(
      `(async()=>{
      const encode=buffer=>btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const credential=await navigator.credentials.get({publicKey:{
        challenge:new Uint8Array(${JSON.stringify([
          ...challenge,
        ])}),rpId:${JSON.stringify(rpId)},
        userVerification:'required',timeout:10000,
      }});
      return {id:credential.id,client:encode(credential.response.clientDataJSON),authenticatorData:encode(credential.response.authenticatorData),signature:encode(credential.response.signature)};
    })()`,
      true
    );
    assert.equal(
      assertion.id,
      registration.id,
      'Discoverable authentication selects the registered credential'
    );
    const clientBytes = Buffer.from(assertion.client, 'base64');
    const authentication = JSON.parse(clientBytes.toString('utf8'));
    assert.equal(authentication.type, 'webauthn.get');
    assert.equal(authentication.origin, origin);
    assert.equal(authentication.challenge, challenge.toString('base64url'));
    const data = Buffer.from(assertion.authenticatorData, 'base64');
    assert.deepEqual(
      data.subarray(0, 32),
      crypto.createHash('sha256').update(rpId).digest()
    );
    assert.equal(data[32] & 5, 5, 'User presence and verification are signed');
    const signed = Buffer.concat([
      data,
      crypto.createHash('sha256').update(clientBytes).digest(),
    ]);
    const signature = Buffer.from(assertion.signature, 'base64');
    assert(
      crypto.verify('sha256', signed, key, signature),
      'Relying party must verify the actual assertion signature'
    );
    const tampered = Buffer.from(signed);
    tampered[0] ^= 1;
    assert(
      !crypto.verify('sha256', tampered, key, signature),
      'Modified assertion data must fail verification'
    );
    assert.equal(
      await web.executeJavaScript(
        `navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'example.com',timeout:1000}}).then(()=> 'accepted',error=>error.name)`,
        true
      ),
      'SecurityError'
    );
    assert.equal(
      await web.executeJavaScript(
        `(async()=>{const controller=new AbortController();controller.abort();try{await navigator.credentials.get({signal:controller.signal,publicKey:{challenge:new Uint8Array(32),rpId:${JSON.stringify(
          rpId
        )}}});return 'accepted';}catch(error){return error.name;}})()`,
        true
      ),
      'AbortError'
    );
    stage = 'cross-origin iframe policy';
    const childServer = http.createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        `<script>navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:'localhost',timeout:1000}}).then(()=>parent.postMessage('accepted','*'),error=>parent.postMessage(error.name,'*'));</script>`
      );
    });
    await new Promise((resolve) => childServer.listen(0, '127.0.0.1', resolve));
    const childOrigin = `http://localhost:${childServer.address().port}`;
    try {
      const denied = await web.executeJavaScript(
        `new Promise(resolve=>{
        const frame=document.createElement('iframe');
        const finish=value=>{clearTimeout(timer);removeEventListener('message',receive);frame.remove();resolve(value);};
        const receive=event=>{if(event.origin===${JSON.stringify(
          childOrigin
        )}&&event.source===frame.contentWindow)finish(event.data);};
        const timer=setTimeout(()=>finish('timed out'),5000);
        addEventListener('message',receive);frame.src=${JSON.stringify(
          childOrigin
        )};document.body.append(frame);
      })`,
        true
      );
      assert.equal(
        denied,
        'NotAllowedError',
        'Cross-origin iframe must not use passkeys without delegated Permissions Policy'
      );
    } finally {
      childServer.closeAllConnections();
      await new Promise((resolve) => childServer.close(resolve));
    }
  } catch (error) {
    throw new Error(
      `Virtual WebAuthn ${stage} failed: ${
        error?.message || JSON.stringify(error)
      }`
    );
  } finally {
    web.session.removeListener('select-webauthn-account', selectFixtureAccount);
    try {
      if (authenticatorId)
        await web.debugger.sendCommand('WebAuthn.removeVirtualAuthenticator', {
          authenticatorId,
        });
    } finally {
      if (web.debugger.isAttached()) web.debugger.detach();
    }
  }
};
