import fs from 'node:fs';
import path from 'node:path';

const pluginPath = path.resolve(
  'node_modules/expo-modules-autolinking/android/expo-gradle-plugin/expo-autolinking-plugin/src/main/kotlin/expo/modules/plugin/ExpoAutolinkingPlugin.kt'
);

const source = fs.readFileSync(pluginPath, 'utf8');
const originalBlock = `    project.providers.exec { spec ->
        spec.workingDir(nodeWorkingDir)
        spec.commandLine(
            "node",
            "--no-warnings",
            "--eval",
            "require('expo/bin/autolinking')",
            "expo-modules-autolinking",
            "mirror-kotlin-inline-modules",
            "--kotlin-files-mirror-directory",
            srcDir,
            "--inline-modules-list-directory",
            buildDir,
            "--watched-directories-serialized",
            watchedDirectoriesSerialized
        )
    }.standardOutput.asText.get()`;

const previousPatchedBlock = `    // Harmonia has no Expo inline-module watch directories. CI generates the
    // empty module list before Gradle starts, so avoid launching Node again
    // after every Gradle plugin has consumed the hosted runner's memory.
    if (watchedDirectoriesSerialized.toString() != "[]") {
      project.providers.exec { spec ->
          spec.workingDir(nodeWorkingDir)
          spec.commandLine(
              "node",
              "--no-warnings",
              "--eval",
              "require('expo/bin/autolinking')",
              "expo-modules-autolinking",
              "mirror-kotlin-inline-modules",
              "--kotlin-files-mirror-directory",
              srcDir,
              "--inline-modules-list-directory",
              buildDir,
              "--watched-directories-serialized",
              watchedDirectoriesSerialized
          )
      }.standardOutput.asText.get()
    }`;

const patchedBlock = `    // CI generates the inline-module list before Gradle starts, so avoid
    // launching the same Node command again after all Gradle plugins load.
    // Non-CI builds retain Expo's standard inline-module discovery behavior.
    if (System.getenv("CI") != "1") {
      project.providers.exec { spec ->
          spec.workingDir(nodeWorkingDir)
          spec.commandLine(
              "node",
              "--no-warnings",
              "--eval",
              "require('expo/bin/autolinking')",
              "expo-modules-autolinking",
              "mirror-kotlin-inline-modules",
              "--kotlin-files-mirror-directory",
              srcDir,
              "--inline-modules-list-directory",
              buildDir,
              "--watched-directories-serialized",
              watchedDirectoriesSerialized
          )
      }.standardOutput.asText.get()
    }`;

if (source.includes(patchedBlock)) {
  console.log('Expo inline autolinking patch is already applied.');
  process.exit(0);
}

const patchableBlock = source.includes(previousPatchedBlock)
  ? previousPatchedBlock
  : originalBlock;

if (!source.includes(patchableBlock)) {
  throw new Error(
    `Expo autolinking source changed; refusing to patch an unknown version: ${pluginPath}`
  );
}

fs.writeFileSync(pluginPath, source.replace(patchableBlock, patchedBlock));
console.log('Skipped Expo inline-module Node launch after the CI preflight.');
