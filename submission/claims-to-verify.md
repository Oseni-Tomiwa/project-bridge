# Project Bridge: Pre-Submission Verification & Confirmation Register

---

```text
==================================================================================================
PRE-SUBMISSION VERIFICATION REGISTER
Purpose:             Document all runtime links, deployment states, and operational claims
                     that must be manually confirmed before submitting to challenge evaluators.
==================================================================================================
```

---

## 1. External URLs & Artifact Identifiers

| Item | Verification Target | Status | Assigned Owner |
|---|---|:---:|:---:|
| **Live App URL** | `https://project-bridge-web-production.up.railway.app` (or custom domain) | `[ ] To Verify` | Deployment Lead |
| **Backend API URL** | `https://project-bridge-api-production.up.railway.app` | `[ ] To Verify` | Deployment Lead |
| **GitHub Repository** | `https://github.com/Oseni-Tomiwa/project-bridge` (Public visibility) | `[ ] To Verify` | Repository Admin |
| **Demo Video Link** | YouTube / Vimeo Unlisted or Public URL (e.g., `https://youtu.be/...`) | `[ ] To Verify` | Video Producer |
| **Benchmark PDF File** | `submission/BENCHMARK_REPORT.pdf` rendered and uploaded to release assets | `[ ] To Verify` | Benchmark Lead |

---

## 2. Operational & Technical Claims Checklist

- [ ] **1. Sahara API In Live Demo:** Confirm that the live video demonstration actually invokes the Intron/Sahara synchronous STT API endpoint (`https://infer.voice.intron.io/file/v1/upload/sync`) with `use_language_asr_input=yo` using a valid `INTRON_API_KEY`.
- [ ] **2. Railway Staging Stability:** Verify that Railway production deployment completes without build errors and that Vite environment variables and API proxy routes communicate smoothly.
- [ ] **3. Video Hard Cap ($< 5\text{ minutes}$):** Confirm that the recorded video does not exceed 5:00.00 under any circumstances.
- [ ] **4. Benchmark PDF Hard Cap ($\le 3\text{ pages}$):** Confirm that the compiled PDF report is exactly 3 pages or fewer with readable typography and clean margins.
- [ ] **5. AfriSwitch Primary Access Status:** Confirm that AfriSwitch is documented as the intended primary benchmark awaiting materialization, and that Vocal Money is strictly labeled as secondary/development evidence.
- [ ] **6. No Clinical Validation Claims:** Confirm that no submission text, slides, or narration claim real clinical validation, diagnostic accuracy, or real hospital partnerships.
- [ ] **7. No User Persistence / Privacy Leak:** Confirm that the deployed web application does not log raw voice audio to browser storage or server disk.

---

## 3. Remaining Submission Blockers (Pre-Submission Gate)

1. **Video Recording & Upload:** Record the ~4:30–4:45 screencast following `submission/demo-script.md` and obtain the final video URL.
2. **PDF Compilation:** Render `submission/BENCHMARK_REPORT.md` into `submission/BENCHMARK_REPORT.pdf` using the print guide.
3. **Form Submission:** Paste verified text blocks from `submission/form-answers.md` into the challenge submission portal.
