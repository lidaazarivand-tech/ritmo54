import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

test('release signing reads secrets only from user Gradle properties or environment', () => {
  const aliases = {
    ritmoStoreFile: 'RITMO_RELEASE_STORE_FILE',
    ritmoStorePassword: 'RITMO_RELEASE_STORE_PASSWORD',
    ritmoKeyAlias: 'RITMO_RELEASE_KEY_ALIAS',
    ritmoKeyPassword: 'RITMO_RELEASE_KEY_PASSWORD',
  };
  for (const [personalProperty, environmentProperty] of Object.entries(aliases)) {
    assert.match(gradle, new RegExp(`gradleProperty\\('${personalProperty}'\\)`));
    assert.match(gradle, new RegExp(`gradleProperty\\('${environmentProperty}'\\)`));
    assert.match(gradle, new RegExp(`environmentVariable\\('${environmentProperty}'\\)`));
    assert.ok(
      gradle.indexOf(`gradleProperty('${personalProperty}')`) <
        gradle.indexOf(`gradleProperty('${environmentProperty}')`),
      `${personalProperty} should take precedence over ${environmentProperty}`,
    );
  }
  for (const property of [
    'RITMO_RELEASE_STORE_FILE',
    'RITMO_RELEASE_STORE_PASSWORD',
    'RITMO_RELEASE_KEY_ALIAS',
    'RITMO_RELEASE_KEY_PASSWORD',
  ]) {
    assert.match(gradle, new RegExp(`environmentVariable\\('${property}'\\)`));
  }
  assert.match(gradle, /signingConfig signingConfigs\.release/);
  assert.match(gradle, /gradle\.taskGraph\.whenReady/);
  assert.match(gradle, /'assembleRelease', 'bundleRelease', 'packageRelease', 'signReleaseBundle'/);
  assert.match(gradle, /Release signing is not configured/);
  assert.doesNotMatch(gradle, /storePassword\s+['"][^'"]+['"]/);
  assert.doesNotMatch(gradle, /keyPassword\s+['"][^'"]+['"]/);
});

test('source ignore rules exclude signing material and local Gradle properties', () => {
  for (const entry of ['*.jks', '*.keystore', 'android/key.properties', 'android/keystore.properties']) {
    assert.ok(gitignore.includes(entry), `Missing signing ignore pattern: ${entry}`);
  }
});
