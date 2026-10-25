"""Focused fail-closed tests for the edu-rpg release identity gate."""
from __future__ import annotations

import base64
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import plistlib
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import verify_edu_rpg_release_identity as gate
import terrain_current_profile as forward
import test_terrain_current_profile as terrain_fixtures


class ReleaseIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.root = self.base / "repo"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.root, check=True)
        self._write("index.html", "shell")
        self._write("package.json", "{}")
        self._write("scripts/build_static_index.mjs", "// build shell\n")
        self._write("scripts/build-dist.sh", "#!/bin/sh\n")
        self._write("scripts/sync-ios.sh", "#!/bin/sh\n")
        self._write("scripts/ship-gate.sh", "#!/bin/sh\n")
        self._write("scripts/ship-ios.sh", "#!/bin/sh\n")
        self._write("scripts/ship_ios.py", "# ship\n")
        self._write("scripts/run-ios.sh", "#!/bin/sh\n")
        self._write("scripts/runtime_baseline.py", "# baseline\n")
        self._write("scripts/terrain_current_profile.py", "# profile\n")
        self._write("scripts/verify_edu_rpg_release_identity.py", "# verifier\n")
        self._write("public/runtime.js", "runtime-v1")
        self._write("design/terrain-current-profile-20261007/input.json", "{}")
        self._write("ios/App/App.xcodeproj/project.pbxproj", "CODE_SIGN_STYLE = Automatic;\nDEVELOPMENT_TEAM = SOURCE_TEAM;\nCODE_SIGN_IDENTITY = SOURCE_ID;\nPROVISIONING_PROFILE_SPECIFIER = SOURCE_PROFILE;\nIPHONEOS_DEPLOYMENT_TARGET = 16.4;\n")
        self._write("ios/App/App/AppDelegate.swift", "// app\n")
        self._write("ios/App/App/SceneDelegate.swift", "// scene\n")
        self._write("ios/App/Podfile", "platform :ios, '16.4'\n")
        self._write("ios/App/Podfile.lock", "PODS:\n")
        self._write("ios/App/fastlane/Fastfile", "lane :beta do; end\n")
        self._write("dist/runtime.js", "runtime-v1")
        self._write("ios/App/App/public/runtime.js", "runtime-v1")
        self._write("ios/App/App/public/cordova.js", "")
        self._write("ios/App/App/public/cordova_plugins.js", "")
        self.sim_app = self.base / "DerivedData/Build/Products/Release-iphonesimulator/App.app"
        self._app(self.sim_app, "iPhoneSimulator")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        subprocess.run(["git", "commit", "-qm", "fixture"], cwd=self.root, check=True)
        self.identity_path = self.root / "ios/build/release/identity.json"
        with redirect_stdout(io.StringIO()):
            gate.write_prepared(self.root, gate.PROFILE_HISTORICAL, 77, self.sim_app, self.identity_path)
        self.identity = json.loads(self.identity_path.read_text())
        self.core = self.identity["core"]
        self.cert_data = b"fixture Apple Distribution certificate DER"
        self.cert_sha1 = hashlib.sha1(self.cert_data).hexdigest()
        self.evidence_dir = self.root / "ios/build/release/evidence"
        self.evidence_dir.mkdir(parents=True)
        self.phone_path = self.root / "ios/build/release/phone.json"
        self.tablet_path = self.root / "ios/build/release/tablet.json"
        self._receipt(self.phone_path, "phone", gate.PHONE_UDID, "iPhone 16", "18.6")
        self._receipt(self.tablet_path, "tablet", gate.TABLET_UDID, "iPad mini (A17 Pro)", "26.5")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _write(self, rel: str, text: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def _app(self, app: Path, platform: str, build: str = "77") -> None:
        app.mkdir(parents=True, exist_ok=True)
        platforms = [platform]
        (app / "Info.plist").write_bytes(plistlib.dumps({
            "CFBundleIdentifier": gate.APP_ID,
            "CFBundleVersion": build,
            "CFBundleShortVersionString": "1.0",
            "CFBundleSupportedPlatforms": platforms,
        }))
        (app / "binary").write_bytes(b"binary")
        (app / "public").mkdir(exist_ok=True)
        (app / "public/runtime.js").write_bytes(b"runtime-v1")

    def _receipt(self, path: Path, role: str, udid: str, model: str, runtime: str) -> None:
        evidence = self.evidence_dir / f"{role}.png"
        evidence.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ioAAAAASUVORK5CYII="))
        receipt = {
            "schema": gate.RECEIPT_SCHEMA,
            "reviewer": f"independent-{role}-reviewer",
            "reviewerIndependentOfImplementation": True,
            "testedAt": "2026-10-07T10:00:00Z",
            "result": "pass",
            "candidateId": gate.sha_bytes(gate.canonical(self.core)),
            "platform": "iOS Simulator",
            "deviceRole": role,
            "deviceModel": model,
            "runtimeVersion": runtime,
            "udid": udid,
            "bundleId": gate.APP_ID,
            "buildNumber": 77,
            "simulatorAppSha256": self.core["simulatorAppSha256"],
            "checks": {key: True for key in gate.REQUIRED_QA_CHECKS},
            "evidence": [{"path": evidence.relative_to(self.root).as_posix(), "sha256": gate.sha_file(evidence),
                          "checksCovered": sorted(gate.REQUIRED_QA_CHECKS)}],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(receipt))

    def _seal(self) -> None:
        with redirect_stdout(io.StringIO()):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)
        self.identity = json.loads(self.identity_path.read_text())

    def _args(self, **kwargs):
        data = {
            "root": str(self.root), "identity": str(self.identity_path),
            "identity_sha256": gate.sha_file(self.identity_path), "expected_build": None,
            "terrain_profile": gate.PROFILE_HISTORICAL,
            "expected_team": "TESTTEAM", "expected_signing_identity": "TESTCERT",
            "expected_profile": "TESTPROFILE", "expected_signing_style": "Manual",
        }
        data.update(kwargs)
        return type("Args", (), data)()

    def _ipa(self, path: Path, platform: str = "iPhoneOS", build: str = "77", payload: bytes = b"runtime-v1",
             *, binary: bytes = b"device binary", profile: bool = True,
             profile_overrides: dict | None = None) -> None:
        info = plistlib.dumps({
            "CFBundleIdentifier": gate.APP_ID,
            "CFBundleVersion": build,
            "CFBundleShortVersionString": "1.0",
            "CFBundleSupportedPlatforms": [platform],
            "CFBundleExecutable": "binary",
        })
        profile_data = b"fixture CMS profile"
        resources = {
            "Info.plist": hashlib.sha256(info).hexdigest(),
            "binary": hashlib.sha256(binary).hexdigest(),
            "public/runtime.js": hashlib.sha256(payload).hexdigest(),
        }
        if profile:
            resources["embedded.mobileprovision"] = hashlib.sha256(profile_data).hexdigest()
        distribution_profile = {
            "Name": "TESTPROFILE",
            "TeamIdentifier": ["TESTTEAM"],
            "ApplicationIdentifierPrefix": ["TESTTEAM"],
            "Entitlements": {
                "application-identifier": f"TESTTEAM.{gate.APP_ID}",
                "com.apple.developer.team-identifier": "TESTTEAM",
                "get-task-allow": False,
            },
            "Platform": ["iOS"],
            "ExpirationDate": datetime.now(timezone.utc) + timedelta(days=30),
            "DeveloperCertificates": [self.cert_data],
        }
        if profile_overrides:
            distribution_profile.update(profile_overrides)
        self.fixture_profile = distribution_profile
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("Payload/App.app/Info.plist", info)
            archive.writestr("Payload/App.app/public/runtime.js", payload)
            binary_info = zipfile.ZipInfo("Payload/App.app/binary")
            binary_info.external_attr = (0o100755 << 16)
            archive.writestr(binary_info, binary)
            if profile:
                archive.writestr("Payload/App.app/embedded.mobileprovision", profile_data)
            archive.writestr("Payload/App.app/_CodeSignature/CodeResources", json.dumps(resources))

    def _signature_tools(self, *, verify_error: bool = False, team: str = "TESTTEAM",
                         cert_data: bytes | None = None, mach_platform: int = 2):
        cert = self.cert_data if cert_data is None else cert_data
        real_run = subprocess.run

        def fake_run(command, *args, **kwargs):
            command = [str(value) for value in command]
            if command[0] == "codesign" and "--verify" in command:
                if verify_error:
                    return subprocess.CompletedProcess(command, 1, "", "code signature invalid")
                app = Path(command[-1])
                resources = json.loads((app / "_CodeSignature/CodeResources").read_text())
                for rel, expected in resources.items():
                    file = app / rel
                    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
                        return subprocess.CompletedProcess(command, 1, "", f"sealed resource changed: {rel}")
                return subprocess.CompletedProcess(command, 0, "", "")
            if command[0] == "codesign" and "--display" in command:
                extraction_args = [value for value in command if value.startswith("--extract-certificates=")]
                if len(extraction_args) != 1:
                    return subprocess.CompletedProcess(command, 1, "", "certificate prefix must be attached to --extract-certificates")
                prefix = Path(extraction_args[0].split("=", 1)[1])
                prefix.parent.mkdir(parents=True, exist_ok=True)
                Path(f"{prefix}0").write_bytes(cert)
                return subprocess.CompletedProcess(command, 0, "", f"Identifier={gate.APP_ID}\nTeamIdentifier={team}\n")
            if command[:3] == ["security", "cms", "-D"]:
                return subprocess.CompletedProcess(command, 0, plistlib.dumps(self.fixture_profile).decode(), "")
            if command[:2] == ["otool", "-l"]:
                return subprocess.CompletedProcess(command, 0,
                    f"Load command 0\n      cmd LC_BUILD_VERSION\n  platform {mach_platform}\n", "")
            return real_run(command, *args, **kwargs)

        return patch.object(gate.shutil, "which", return_value="/mock/mac-tool"), patch.object(gate.subprocess, "run", side_effect=fake_run)

    def _rewrite_ipa_member(self, path: Path, member_name: str, replacement: bytes) -> None:
        rewritten = path.with_suffix(".rewritten.ipa")
        with zipfile.ZipFile(path) as source, zipfile.ZipFile(rewritten, "w") as target:
            for member in source.infolist():
                data = replacement if member.filename == member_name else source.read(member)
                target.writestr(member, data)
        rewritten.replace(path)

    def _apply_signing(self) -> None:
        project = self.root / gate.PBXPROJ
        current = project.read_text()
        for old, new in (("Automatic", "Manual"), ("SOURCE_TEAM", "TESTTEAM"),
                         ("SOURCE_ID", self.cert_sha1), ("SOURCE_PROFILE", "TESTPROFILE")):
            current = current.replace(old, new)
        project.write_text(current)

    def test_valid_pending_app_then_sealed_candidate_and_device_ipa(self) -> None:
        gate.verify_simulator_app(self._args(app=str(self.sim_app)))
        with self.assertRaisesRegex(gate.GateError, "phone and tablet"):
            gate.verify_candidate(self._args())
        self._seal()
        gate.verify_candidate(self._args(expected_build=77))
        self._apply_signing()
        ipa = self.base / "candidate.ipa"
        self._ipa(ipa)
        which, runner = self._signature_tools()
        with which, runner:
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_source_mutation_fails(self) -> None:
        self._seal()
        (self.root / "scripts/build-dist.sh").write_text("mutated\n")
        with self.assertRaisesRegex(gate.GateError, "source input"):
            gate.verify_candidate(self._args())

    def test_forward_release_envelope_passes_only_for_the_sealed_prepared_core(self) -> None:
        descriptor = terrain_fixtures._preparation_descriptor_fixture(self.root)
        descriptor_path = self.root / forward.DESCRIPTOR_RELATIVE
        descriptor_path.parent.mkdir(parents=True, exist_ok=True)
        descriptor_path.write_text(json.dumps(descriptor, sort_keys=True, separators=(",", ":")))
        descriptor_sha = gate.sha_file(descriptor_path)
        with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
            with patch.object(gate, "profile_check", return_value=None):
                with redirect_stdout(io.StringIO()):
                    gate.write_prepared(self.root, gate.PROFILE_FORWARD, 77, self.sim_app,
                                        self.identity_path, qa_preparation=True)
            self.identity = json.loads(self.identity_path.read_text())
            self.core = self.identity["core"]
            self._receipt(self.phone_path, "phone", gate.PHONE_UDID, "iPhone 16", "18.6")
            self._receipt(self.tablet_path, "tablet", gate.TABLET_UDID,
                          "iPad mini (A17 Pro)", "26.5")
            with patch.object(gate, "profile_check", return_value=None):
                self._seal()
            self.identity = json.loads(self.identity_path.read_text())
            self.core = self.identity["core"]
            with patch.object(gate, "profile_check", return_value=None):
                with self.assertRaisesRegex(gate.GateError, "requires an externally SHA-pinned"):
                    gate.verify_candidate(self._args(terrain_profile=gate.PROFILE_FORWARD))
                for rel, changed, expected_error in (
                    ("scripts/build-dist.sh", "mutated source\n", "source input"),
                    ("dist/runtime.js", "mutated payload", "dist runtime payload changed"),
                    ("ios/App/App/SceneDelegate.swift", "mutated native\n", "native input"),
                ):
                    target = self.root / rel
                    original = target.read_bytes()
                    target.write_text(changed)
                    try:
                        with self.assertRaisesRegex(gate.GateError, expected_error):
                            gate.verify_current_core(self.root, self.identity,
                                                     expected_profile=gate.PROFILE_FORWARD)
                    finally:
                        target.write_bytes(original)
            receipt_hashes = {item["deviceRole"]: item["receiptSha256"]
                              for item in self.identity["qaReceipts"]}
            review_path = self.root / "ios/build/release/evidence/terrain-review.md"
            review_path.parent.mkdir(parents=True, exist_ok=True)
            review_path.write_text("Independent review of exact forward QA candidate.\n")
            review_sha = gate.sha_file(review_path)
            completed_assertions = {
                path: {"value": True, "requiredGroups": list(groups)}
                for path, groups in forward.PENDING_PROOF_ASSERTION_GROUPS.items()
            }
            reviewed_assertions = {
                path: {"result": "PASS", "requiredGroups": list(groups)}
                for path, groups in forward.PENDING_PROOF_ASSERTION_GROUPS.items()
            }
            evidence = {
                "schema": forward.RELEASE_EVIDENCE_SCHEMA,
                "profileId": forward.PROFILE_ID,
                "proofFieldSplitVersion": forward.PROOF_FIELD_SPLIT_VERSION,
                "result": "PASS",
                "releaseEligible": True,
                "descriptorSha256": descriptor_sha,
                "authoringInputInventorySha256": forward.inventory_digest(descriptor["authoringInputs"]),
                "generatedOutputInventorySha256": forward.inventory_digest(descriptor["generatedOutputs"]["inventory"]),
                "candidateId": self.identity["candidateId"],
                "candidateCoreSha256": gate.sha_bytes(gate.canonical(self.core)),
                "sourceInputsSha256": self.core["sourceInputsSha256"],
                "nativeInputsSha256": self.core["nativeInputsSha256"],
                "runtimePayloadSha256": self.core["runtimePayloadSha256"],
                "runtimeFileCount": self.core["runtimeFileCount"],
                "buildNumber": self.core["buildNumber"],
                "simulatorAppSha256": self.core["simulatorAppSha256"],
                "sealedReceiptSha256s": receipt_hashes,
                "checks": {},
                "completedProofAssertions": completed_assertions,
                "independentReview": {"reviewer": "Independent QA reviewer",
                    "independentOfImplementation": True,
                    "recordPath": review_path.relative_to(self.root).as_posix(),
                    "recordBytes": review_path.stat().st_size, "recordSha256": review_sha,
                    "assertionResults": reviewed_assertions},
            }
            for check in forward.DYNAMIC_CHECKS:
                evidence["checks"][check] = {
                    "result": "PASS",
                    "phoneEvidenceSha256": gate.sha_file(self.evidence_dir / "phone.png"),
                    "tabletEvidenceSha256": gate.sha_file(self.evidence_dir / "tablet.png"),
                }
            evidence_path = self.base / "forward-release-evidence.json"
            evidence_path.write_text(json.dumps(evidence, sort_keys=True, separators=(",", ":")))
            with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                              gate.sha_file(evidence_path))
                # Exercise the real argparse/main path: argparse must turn the
                # evidence string into a Path before the shared symlink check.
                cli_args = [
                    "candidate", "--root", str(self.root), "--identity", str(self.identity_path),
                    "--identity-sha256", gate.sha_file(self.identity_path),
                    "--terrain-profile", gate.PROFILE_FORWARD, "--expected-build", "77",
                    "--terrain-evidence", str(evidence_path),
                    "--terrain-evidence-sha256", gate.sha_file(evidence_path),
                ]
                cli_stdout, cli_stderr = io.StringIO(), io.StringIO()
                with redirect_stdout(cli_stdout), redirect_stderr(cli_stderr):
                    self.assertEqual(gate.main(cli_args), 0, cli_stderr.getvalue())
                self.assertIn("CANDIDATE IDENTITY PASS", cli_stdout.getvalue())

                linked_evidence = self.base / "forward-release-evidence-link.json"
                linked_evidence.symlink_to(evidence_path)
                linked_args = list(cli_args)
                linked_args[linked_args.index("--terrain-evidence") + 1] = str(linked_evidence)
                cli_stdout, cli_stderr = io.StringIO(), io.StringIO()
                with redirect_stdout(cli_stdout), redirect_stderr(cli_stderr):
                    self.assertEqual(gate.main(linked_args), 1)
                self.assertIn("external terrain evidence must not be a symlink", cli_stderr.getvalue())

                phone_image = self.evidence_dir / "phone.png"
                original_image = phone_image.read_bytes()
                phone_image.write_bytes(original_image + b"changed")
                try:
                    with self.assertRaisesRegex(gate.GateError, "evidence missing or hash mismatch"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))
                finally:
                    phone_image.write_bytes(original_image)
                incomplete = dict(evidence)
                incomplete["checks"] = dict(evidence["checks"])
                incomplete["checks"].pop(forward.PENDING_DYNAMIC_CHECKS[0])
                evidence_path.write_text(json.dumps(incomplete))
                with self.assertRaisesRegex(gate.GateError, "does not cover every named pending"):
                    gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                  gate.sha_file(evidence_path))
                bad_assertions = dict(evidence)
                bad_assertions["completedProofAssertions"] = dict(evidence["completedProofAssertions"])
                bad_assertions["completedProofAssertions"].pop(forward.PENDING_PROOF_ASSERTIONS[0])
                evidence_path.write_text(json.dumps(bad_assertions))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "exact pending proof assertion set"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))

                extra_assertion = json.loads(json.dumps(evidence))
                extra_assertion["completedProofAssertions"]["routes.inventedPass"] = {
                    "value": True, "requiredGroups": ["cliffGrassRoutes"]}
                evidence_path.write_text(json.dumps(extra_assertion))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "exact pending proof assertion set"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))

                bad_value = json.loads(json.dumps(evidence))
                bad_value["completedProofAssertions"][forward.PENDING_PROOF_ASSERTIONS[0]]["value"] = False
                evidence_path.write_text(json.dumps(bad_value))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "false or maps to unreviewed groups"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))

                bad_groups = json.loads(json.dumps(evidence))
                bad_groups["completedProofAssertions"][forward.PENDING_PROOF_ASSERTIONS[0]]["requiredGroups"] = ["terrainContactBothHeroes"]
                evidence_path.write_text(json.dumps(bad_groups))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "false or maps to unreviewed groups"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))

                bad_review = json.loads(json.dumps(evidence))
                bad_review["independentReview"]["assertionResults"].pop(forward.PENDING_PROOF_ASSERTIONS[0])
                evidence_path.write_text(json.dumps(bad_review))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "exact pending proof assertion set"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))

                bad_version = dict(evidence)
                bad_version["proofFieldSplitVersion"] = "unknown-proof-contract"
                evidence_path.write_text(json.dumps(bad_version))
                with patch.object(forward, "PINNED_DESCRIPTOR_SHA256", descriptor_sha):
                    with self.assertRaisesRegex(gate.GateError, "not a release-eligible"):
                        gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                      gate.sha_file(evidence_path))
                wrong_receipt = dict(evidence)
                wrong_receipt["sealedReceiptSha256s"] = dict(receipt_hashes, tablet="0" * 64)
                evidence_path.write_text(json.dumps(wrong_receipt))
                with self.assertRaisesRegex(gate.GateError, "phone/tablet receipt pins differ"):
                    gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                  gate.sha_file(evidence_path))
                stale = dict(evidence)
                stale["candidateCoreSha256"] = "0" * 64
                evidence_path.write_text(json.dumps(stale))
                with self.assertRaisesRegex(gate.GateError, "stale or bound to another candidate"):
                    gate.verify_forward_evidence(self.root, self.identity, evidence_path,
                                                  gate.sha_file(evidence_path))

    def test_runtime_payload_mutation_fails(self) -> None:
        self._seal()
        (self.root / "dist/runtime.js").write_text("mutated")
        with self.assertRaisesRegex(gate.GateError, "runtime payload changed"):
            gate.verify_candidate(self._args())

    def test_new_or_modified_native_input_fails(self) -> None:
        self._seal()
        (self.root / "ios/App/App/SceneDelegate.swift").write_text("changed\n")
        with self.assertRaisesRegex(gate.GateError, "native input"):
            gate.verify_candidate(self._args())

    def test_simulator_package_inventory_mutation_fails(self) -> None:
        app_file = self.sim_app / "binary"
        app_file.write_bytes(b"changed binary")
        with self.assertRaisesRegex(gate.GateError, "Simulator app bytes differ"):
            gate.verify_simulator_app(self._args(app=str(self.sim_app)))

    def test_expected_build_mismatch_fails(self) -> None:
        self._seal()
        with self.assertRaisesRegex(gate.GateError, "does not match expected"):
            gate.verify_candidate(self._args(expected_build=78))

    def test_forward_cli_evidence_options_parse_as_paths_for_all_entrypoints(self) -> None:
        common = ["--root", "/repo", "--identity", "/identity.json", "--identity-sha256", "a" * 64,
                  "--terrain-evidence", "/evidence.json", "--terrain-evidence-sha256", "b" * 64]
        cases = [
            ["candidate", *common],
            ["simulator-app", *common, "--app", "/Candidate.app"],
            ["ipa", *common, "--ipa", "/Candidate.ipa", "--expected-team", "TEAM",
             "--expected-signing-identity", "CERT", "--expected-profile", "PROFILE"],
        ]
        for argv in cases:
            with self.subTest(command=argv[0]):
                args = gate.build_parser().parse_args(argv)
                self.assertIsInstance(args.terrain_evidence, Path)

    def test_identity_profile_must_match_selected_profile(self) -> None:
        self._seal()
        with self.assertRaisesRegex(gate.GateError, "differs from selected profile"):
            gate.verify_candidate(self._args(terrain_profile=gate.PROFILE_FORWARD))

    def test_identity_hash_mismatch_fails(self) -> None:
        self._seal()
        with self.assertRaisesRegex(gate.GateError, "SHA-256"):
            gate.verify_candidate(self._args(identity_sha256="0" * 64))

    def test_identity_stage_must_match_selected_terrain_profile(self) -> None:
        self.identity["preparationOnly"] = True
        self.identity_path.write_text(json.dumps(self.identity))
        with self.assertRaisesRegex(gate.GateError, "does not match its selected terrain profile"):
            gate.load_identity(self.identity_path, gate.sha_file(self.identity_path))

    def test_device_app_cannot_stand_in_for_simulator_app(self) -> None:
        wrong = self.base / "wrong-platform.app"
        self._app(wrong, "iPhoneOS")
        with self.assertRaisesRegex(gate.GateError, "iOS Simulator .app"):
            gate.verify_simulator_app(self._args(app=str(wrong)))

    def test_wrong_platform_or_build_ipa_fails(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "bad.ipa"
        self._ipa(ipa, platform="iPhoneSimulator")
        with self.assertRaisesRegex(gate.GateError, "not an iPhoneOS"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))
        self._ipa(ipa, build="76")
        with self.assertRaisesRegex(gate.GateError, "build number"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_device_ipa_payload_mutation_fails(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "payload-mismatch.ipa"
        self._ipa(ipa, payload=b"different runtime")
        with self.assertRaisesRegex(gate.GateError, "runtime payload differs"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_unsigned_device_app_fails_closed(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "unsigned.ipa"
        self._ipa(ipa)
        which, runner = self._signature_tools(verify_error=True)
        with which, runner, self.assertRaisesRegex(gate.GateError, "code-signature verification failed"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_tampered_native_executable_fails_signature_verification(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "tampered-native.ipa"
        self._ipa(ipa)
        self._rewrite_ipa_member(ipa, "Payload/App.app/binary", b"UNREVIEWED BINARY")
        which, runner = self._signature_tools()
        with which, runner, self.assertRaisesRegex(gate.GateError, "code-signature verification failed"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_wrong_signer_team_or_certificate_fails(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "wrong-signer.ipa"
        self._ipa(ipa)
        which, runner = self._signature_tools(team="OTHERTEAM")
        with which, runner, self.assertRaisesRegex(gate.GateError, "TeamIdentifier"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))
        which, runner = self._signature_tools(cert_data=b"wrong certificate")
        with which, runner, self.assertRaisesRegex(gate.GateError, "expected Fastlane identity"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_wrong_profile_and_missing_profile_fail(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "wrong-profile.ipa"
        self._ipa(ipa, profile_overrides={"Name": "OTHERPROFILE"})
        which, runner = self._signature_tools()
        with which, runner, self.assertRaisesRegex(gate.GateError, "profile name"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))
        self._ipa(ipa, profile=False)
        with which, runner, self.assertRaisesRegex(gate.GateError, "missing embedded.mobileprovision"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_profile_team_and_certificate_must_match_expected_identity(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "profile-identity.ipa"
        self._ipa(ipa, profile_overrides={"TeamIdentifier": ["OTHERTEAM"]})
        which, runner = self._signature_tools()
        with which, runner, self.assertRaisesRegex(gate.GateError, "profile TeamIdentifier"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))
        self._ipa(ipa, profile_overrides={"DeveloperCertificates": [b"other certificate"]})
        with which, runner, self.assertRaisesRegex(gate.GateError, "not present in the embedded provisioning profile"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_simulator_macho_platform_fails_device_ipa_gate(self) -> None:
        self._seal()
        self._apply_signing()
        ipa = self.base / "simulator-macho.ipa"
        self._ipa(ipa)
        which, runner = self._signature_tools(mach_platform=7)
        with which, runner, self.assertRaisesRegex(gate.GateError, "non-iOS-device Mach-O"):
            gate.verify_ipa(self._args(ipa=str(ipa), expected_signing_identity=self.cert_sha1))

    def test_missing_codesign_tool_fails_closed(self) -> None:
        with patch.object(gate.shutil, "which", return_value=None), self.assertRaisesRegex(gate.GateError, "requires macOS tool"):
            gate.verify_signed_device_app(Path("App.app"), "TESTTEAM", "a" * 40, "TESTPROFILE")

    def test_missing_or_corrupt_evidence_fails_sealing(self) -> None:
        self.phone_path.unlink()
        with self.assertRaisesRegex(gate.GateError, "receipt file is missing"):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)
        self._receipt(self.phone_path, "phone", gate.PHONE_UDID, "iPhone 16", "18.6")
        screenshot = self.evidence_dir / "phone.png"
        screenshot.write_bytes(b"corrupt after receipt")
        with self.assertRaisesRegex(gate.GateError, "evidence missing or hash mismatch"):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)

    def test_receipt_path_traversal_fails(self) -> None:
        receipt = json.loads(self.phone_path.read_text())
        receipt["evidence"][0]["path"] = "../../outside.png"
        self.phone_path.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(gate.GateError, "unsafe relative path"):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)

    def test_receipt_symlink_evidence_fails(self) -> None:
        outside = self.base / "outside.png"
        outside.write_bytes((self.evidence_dir / "phone.png").read_bytes())
        linked = self.evidence_dir / "linked.png"
        linked.symlink_to(outside)
        receipt = json.loads(self.phone_path.read_text())
        receipt["evidence"][0]["path"] = linked.relative_to(self.root).as_posix()
        receipt["evidence"][0]["sha256"] = gate.sha_file(outside)
        self.phone_path.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(gate.GateError, "traverses a symlink"):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)

    def test_tablet_udid_and_model_are_mandatory(self) -> None:
        self._receipt(self.tablet_path, "tablet", "F" * 36, "iPad Pro (M5)", "27.0")
        with self.assertRaisesRegex(gate.GateError, "preserved canonical simulator"):
            gate.seal_identity(self.root, self.identity_path, self.phone_path, self.tablet_path)

    def test_signing_only_project_change_is_explicitly_allowed(self) -> None:
        old = (self.root / gate.PBXPROJ).read_text()
        self._apply_signing()
        project = self.root / gate.PBXPROJ
        profile = "app.chalkmap.questofknowledge AppStore 1791791827"
        project.write_text(project.read_text().replace(
            "PROVISIONING_PROFILE_SPECIFIER = TESTPROFILE;",
            f'PROVISIONING_PROFILE_SPECIFIER = "{profile}";',
        ))
        expected = {
            "CODE_SIGN_STYLE": "Manual", "DEVELOPMENT_TEAM": "TESTTEAM",
            "CODE_SIGN_IDENTITY": self.cert_sha1, "PROVISIONING_PROFILE_SPECIFIER": profile,
        }
        gate.validate_signing_overlay(self.root, self.core, expected)
        project.write_text(project.read_text().replace("16.4", "17.0"))
        with self.assertRaisesRegex(gate.GateError, "non-signing change"):
            gate.validate_signing_overlay(self.root, self.core, expected)

    def test_wrong_quoted_profile_with_spaces_is_rejected(self) -> None:
        self._apply_signing()
        project = self.root / gate.PBXPROJ
        project.write_text(project.read_text().replace(
            "PROVISIONING_PROFILE_SPECIFIER = TESTPROFILE;",
            'PROVISIONING_PROFILE_SPECIFIER = "app.chalkmap.questofknowledge WrongProfile 1791791827";',
        ))
        with self.assertRaisesRegex(gate.GateError, "unexpected PROVISIONING_PROFILE_SPECIFIER value"):
            gate.validate_signing_overlay(self.root, self.core, {
                "CODE_SIGN_STYLE": "Manual", "DEVELOPMENT_TEAM": "TESTTEAM",
                "CODE_SIGN_IDENTITY": self.cert_sha1,
                "PROVISIONING_PROFILE_SPECIFIER": "app.chalkmap.questofknowledge AppStore 1791791827",
            })

    def test_unexpected_signing_value_fails(self) -> None:
        self._apply_signing()
        project = self.root / gate.PBXPROJ
        project.write_text(project.read_text().replace(self.cert_sha1, "OTHER_CERT"))
        with self.assertRaisesRegex(gate.GateError, "unexpected CODE_SIGN_IDENTITY value"):
            gate.validate_signing_overlay(self.root, self.core, {
                "CODE_SIGN_STYLE": "Manual", "DEVELOPMENT_TEAM": "TESTTEAM",
                "CODE_SIGN_IDENTITY": self.cert_sha1, "PROVISIONING_PROFILE_SPECIFIER": "TESTPROFILE",
            })

    def test_unknown_profile_fails_closed(self) -> None:
        with self.assertRaisesRegex(gate.GateError, "unknown terrain profile"):
            gate.profile_check(self.root, "typo-forward-profile")


if __name__ == "__main__":
    unittest.main()
