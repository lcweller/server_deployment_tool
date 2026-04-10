# Microsoft 365 SMTP for Steamline (step-by-step)

Steamline sends verification email via **SMTP AUTH** to `smtp.office365.com:587` (STARTTLS). If you see **`535 5.7.139`** mentioning **security defaults**, Microsoft is **rejecting the login**, not Steamline’s URL.

Work through sections **in order**. You need **Global Administrator** or equivalent (Exchange Administrator + Application Administrator for some checks).

---

## 0. What “working” looks like

- **Entra ID** allows this sign-in method (Security defaults / Conditional Access).
- **Exchange Online** allows **SMTP AUTH** at org and/or mailbox level.
- The mailbox **exists**, is **licensed** (where required), and uses a password **or app password** (if MFA is on).

---

## 1. Confirm the mailbox

1. **Microsoft 365 admin center** → [https://admin.microsoft.com](https://admin.microsoft.com) → **Users** → **Active users**.
2. Open the user you use for Steamline (e.g. `noreply@yourdomain.com`).
3. Confirm:
   - **Sign-in blocked** = **Off**
   - Account is **Active**
   - User has a **license** if your tenant requires a license for that mailbox type.

---

## 2. Security defaults (Entra ID)

1. Open **Microsoft Entra admin center** → [https://entra.microsoft.com](https://entra.microsoft.com)
2. In the left menu, open **Microsoft Entra ID** (sometimes shown as **Entra ID** or **Directory** — there is often **no** item named only “Identity”).
3. Go to **Overview** → **Properties** (under that same Entra ID section).
4. At the **bottom** of the **Properties** page, click **Manage security defaults**.

**If you don’t see Entra ID in the menu:** Use the **search box** at the top of the portal and type **Security defaults**, then open the settings from the result.

**Alternate path (Azure portal):** [https://portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **Properties** → **Manage security defaults** (same link at bottom of Properties).

You need at least **Global Administrator** or **Conditional Access Administrator** to change this.
4. Note whether Security defaults are **Enabled** or **Disabled**.

**If Enabled:**  
They often **block legacy authentication**, which **SMTP AUTH (username/password)** relies on. Options:

- **Disable Security defaults** and use **Conditional Access** policies instead (Microsoft’s recommended path for enterprises), **or**
- Work with your security team to add **exceptions** (rarely a one-click fix).

**If you disable Security defaults:** Plan **Conditional Access** policies so you don’t leave the tenant wide open. This is an org security decision, not a Steamline setting.

**If Disabled:** Continue — **Conditional Access** may still block SMTP (section 3).

---

## 3. Conditional Access (legacy / client sign-in)

There is often **no** **Protection** menu. Use **Microsoft Entra ID** → **Conditional Access** instead.

1. **Entra admin center** → left menu **Microsoft Entra ID** → **Conditional Access** → **Policies**  
   Or use the top **search** bar → type **Conditional Access** → open **Policies**.  
   **Direct link (after sign-in):** [Conditional Access policies](https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/Policies)  
   **Alternate:** [Azure portal](https://portal.azure.com) → **Microsoft Entra ID** → **Security** → **Conditional Access**.

You need a role that can **view** policies (e.g. Security Reader, Global Reader) and **edit** them (Conditional Access Administrator or Global Administrator). Managing policies usually requires **Microsoft Entra ID P1** (many M365 business plans include it).

2. For each policy with **State = On**, open and check:
   - **Assignments** → **Users and groups** (who it applies to)
   - **Cloud apps** (often “All cloud apps”)
   - **Conditions** → **Client apps** / **Filter for apps** → entries for **legacy authentication clients** or **Exchange ActiveSync clients**, etc.
   - **Access controls** → **Block** or **Grant** requiring compliant device / hybrid Azure AD joined, etc.

3. Use **What If** (same Conditional Access area):  
   - User: your SMTP mailbox  
   - Cloud app: **Office 365 Exchange Online** (if listed)  
   See whether any policy **blocks** the sign-in.

**If legacy auth is blocked** with no exception, **SMTP with password often fails** until policy is adjusted. This is separate from “SMTP enabled on mailbox.”

---

## 4. Exchange Online: organization SMTP AUTH

### 4a. Admin center (UI)

1. **Exchange admin center** → [https://admin.exchange.microsoft.com](https://admin.exchange.microsoft.com)
2. **Settings** → **Mail flow** (or search **SMTP** / **Authenticated SMTP**).
3. Find the setting that **disables SMTP AUTH for the organization** (wording varies by UI version).
4. Ensure **authenticated SMTP** is **allowed** at the organization level **or** that per-mailbox overrides are allowed (see 4b).

### 4b. PowerShell (source of truth)

Install **Exchange Online PowerShell** (once per machine):  
[Exchange Online PowerShell](https://learn.microsoft.com/powershell/exchange/exchange-online-powershell)

Connect:

```powershell
Connect-ExchangeOnline -UserPrincipalName your-admin@yourdomain.com
```

Check organization flag:

```powershell
Get-TransportConfig | Format-List SmtpClientAuthenticationDisabled
```

- **`SmtpClientAuthenticationDisabled : True`** → SMTP AUTH is **off** for the org (mailbox-level enable may still work depending on tenant — confirm with Microsoft docs for your tenant age).
- To allow at org level (if your policy allows):

```powershell
Set-TransportConfig -SmtpClientAuthenticationDisabled $false
```

---

## 5. Exchange Online: per-mailbox SMTP

```powershell
Get-CASMailbox -Identity "noreply@yourdomain.com" | Format-List DisplayName, SmtpClientAuthenticationEnabled
```

- If **`SmtpClientAuthenticationEnabled : False`** (or empty/disabled), enable:

```powershell
Set-CASMailbox -Identity "noreply@yourdomain.com" -SmtpClientAuthenticationEnabled $true
```

Wait **15–60 minutes** for replication.

---

## 6. MFA and passwords

If the mailbox has **Microsoft multifactor authentication** enabled:

- Use an **[app password](https://support.microsoft.com/account-billing/app-passwords)** as **`SMTP_PASS`** in Steamline (not the regular password), **if** your tenant still supports app passwords for that account.

If app passwords are disabled by policy, **basic SMTP may not be possible** for that user until you use **OAuth / Graph** (different integration) or another send path.

---

## 7. Steamline container variables

Use the **same** domain as the mailbox unless you have **Send As** configured.

| Key | Value |
|-----|--------|
| `SMTP_HOST` | `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Full address, e.g. `noreply@yourdomain.com` |
| `SMTP_PASS` | Password or **app password** |
| `SMTP_FROM` | `Steamline <noreply@yourdomain.com>` |

**Format:** `SMTP_FROM` should look like `Display Name <email@domain.com>` — include **angle brackets** around the email.

Restart the Steamline container after changes.

---

## 8. Verify without Steamline (optional)

From a machine with PowerShell (same credentials you put in Steamline):

```powershell
$cred = Get-Credential   # enter noreply@domain.com + password or app password
Send-MailMessage `
  -From "noreply@yourdomain.com" `
  -To "your-personal-inbox@gmail.com" `
  -Subject "SMTP test" `
  -Body "Test" `
  -SmtpServer "smtp.office365.com" `
  -Port 587 `
  -Credential $cred `
  -UseSsl
```

If this **fails** with the same **535 5.7.139**, the issue is **100% Microsoft policy/config**, not Steamline.

---

## 9. Sign-in logs (debugging)

**Entra admin center** → **Identity** → **Users** → select user → **Sign-in logs**  
Filter **failures** around the test time. Failure **reason** and **client app** columns explain policy blocks.

---

## 10. If it still fails after all of the above

1. **Open a Microsoft support case** (if you have a support plan) with **535 5.7.139** and tenant ID — they can confirm tenant-level blocks.
2. **Alternative for M365 without SMTP:** **Microsoft Graph** `sendMail` with an app registration (requires **code changes** in Steamline).
3. **Alternative without M365 mail:** self-hosted SMTP or a transactional provider (see main README / deploy docs).

---

## Reference

- [Enable or disable authenticated client SMTP submission (Exchange Online)](https://learn.microsoft.com/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission)
- [Security defaults](https://learn.microsoft.com/azure/active-directory/fundamentals/concept-fundamentals-security-defaults)
- [Conditional Access: Block legacy authentication](https://learn.microsoft.com/azure/active-directory/conditional-access/howto-conditional-access-policy-block-legacy)
