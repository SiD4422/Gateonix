# ⬡ Gateonix — Web-Based Digital Logic Circuit Simulator

A fully interactive, browser-based digital logic gate simulator built with vanilla JavaScript, HTML5 Canvas, and CSS. Design, simulate, and export digital circuits entirely in your browser — no installations required.

---

## 🚀 Live Demo

> Open `index.html` in any modern browser to get started.  
> *(GitHub Pages link — add yours here once deployed)*

---

## ✨ Features

### 🔧 Gate Library
- **Basic Gates** — AND, OR, NOT, NAND, NOR, XOR, XNOR, BUFFER
- **Multi-Input Gates** — AND-3, OR-3, AND-4, OR-4
- **Flip-Flops** — SR Latch, D Flip-Flop, JK Flip-Flop, T Flip-Flop
- **MSI Components** — MUX 2:1, MUX 4:1, DEMUX, Encoders, Decoders, Half/Full Adders, Comparator, Bin→Hex Display

### 🧠 Smart Tools
- **Boolean → Circuit** — Type any Boolean expression and auto-build the gate circuit
- **K-Map Solver** — Built-in Karnaugh Map for Boolean minimization
- **Waveform Viewer** — Live timing diagram for all signals
- **Code Panel** — Real-time export to JSON, Python, C, C++, Verilog, and VHDL

### 💾 Circuit Management
- Save and load named circuits (localStorage)
- Import / Export as JSON
- Export as PNG image
- Undo / Redo support

### 📐 Built-in Templates
- Half Adder, Full Adder, 2:1 MUX, 2-to-4 Decoder
- Universal Gate implementations (AND/OR/NOT/XOR using NAND & NOR)
- Flip-Flop conversions (SR↔D↔JK↔T)
- 2-bit Synchronous & Asynchronous Counters
- 4-bit Shift Register, Priority Encoder, and more

### 🎨 UI/UX
- Dark / Light theme toggle (BB-8 style 🤖)
- Minimap for large circuits
- Zoom in/out with fit-to-screen
- Drag-and-drop gate placement
- Live circuit status indicator

---

## 📁 Project Structure

```
gateonix/
├── index.html        # Main simulator canvas
├── kmap.html         # Karnaugh Map solver
├── login.html        # User login page
├── ABOUT.html        # About the project
├── help.html         # User guide
├── Devloper.html     # Developer info
├── Feedback.html     # Feedback form
├── style.css         # Global styles & theming
├── gates.js          # Gate logic & simulation engine
├── canvas.js         # HTML5 Canvas rendering & interaction
├── app.js            # Main app controller
├── boolparser.js     # Boolean expression → circuit parser
├── codepanel.js      # Multi-language code generation panel
├── export.js         # JSON / PNG export functionality
├── waveform.js       # Timing diagram / waveform viewer
└── profile.js        # User profile management
```

---

## 🛠️ Getting Started

No build tools or dependencies needed.

```bash
# Clone the repo
git clone https://github.com/SiD4422/gateonix.git

# Open in browser
cd gateonix
open index.html   # macOS
# or just double-click index.html on Windows/Linux
```

To serve locally (recommended for full feature support):
```bash
npx serve .
# then open http://localhost:3000
```

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| UI / Layout | HTML5, CSS3 |
| Rendering | HTML5 Canvas API |
| Logic & Simulation | Vanilla JavaScript (ES6+) |
| Storage | Browser localStorage |
| Fonts | JetBrains Mono, Syne (Google Fonts) |

---

## 🗺️ Roadmap

- [ ] GitHub Pages deployment
- [ ] Multi-bit bus support
- [ ] Circuit sharing via URL
- [ ] Truth table auto-generation
- [ ] Sub-circuit / module support

---

## 👨‍💻 Developer

**Siddharth Kumar**  
B.Tech EEE — SRM Institute of Science & Technology  
[![LinkedIn](https://img.shields.io/badge/LinkedIn-siddharth--kumar--eee-blue?style=flat&logo=linkedin)](https://linkedin.com/in/siddharth-kumar-eee)
[![GitHub](https://img.shields.io/badge/GitHub-SiD4422-black?style=flat&logo=github)](https://github.com/SiD4422)

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
