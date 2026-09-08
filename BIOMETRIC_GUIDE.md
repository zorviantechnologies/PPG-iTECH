# 🚀 Step-by-Step: Connecting Biometric to PPG iTech HUB

Follow these 5 simple steps to get your attendance machine talking to your website.

---

### Step 1: Physical Network Connection
- Connect an **Ethernet (LAN) Cable** from your Biometric Machine to your **Wifi Router**.
- Ensure the machine is powered ON.

### Step 2: Verify Device Settings
- Open your Biometric Machine **Menu** (shown in your images).
- Go to **Comm.** -> **Ethernet**.
- Confirm your settings match:
    - **IP Address**: `192.168.1.201`
    - **Subnet Mask**: `255.255.255.0`
    - **Gateway**: `192.168.1.1` (usually)

### Step 3: Match User IDs
- For your finger/thumb to sync with the website:
    - The **User ID** in the thumb machine **MUST MATCH** the **Employee ID** in the web dashboard.
    - Example: If the machine says "User ID: 101", the website Employee ID should also be "101".

### Step 4: Start the "Bridge" (Crucial Step)
- On a computer connected to the **same Wifi** as the machine:
    1. Open a **Terminal / Command Prompt**.
    2. Go to the server folder: `cd "server"`
    3. Run the bridge: `node biometric_bridge.js`
- **Confirmation**: You should see: `✅ Connected to device! Listening...`

### Step 5: Verify on Website
- Go to the **Attendance Records** page on your website.
- Click the **"Biometric Sync"** tab in the top-right toggle.
- When an employee punches their finger, you will see:
    - A **Notification** pop-up instantly at the top.
    - The **Log Table** updating automatically with In/Out times.

---

### Helpful Tips
- **Keep it running**: The `biometric_bridge.js` script must be running for live updates.
- **Firewall**: Ensure your computer's firewall allows port `4370` and `5000`.
- **Remote Server**: If your website is on the internet (not localhost), update the `SERVER_API_URL` in `biometric_bridge.js`.
