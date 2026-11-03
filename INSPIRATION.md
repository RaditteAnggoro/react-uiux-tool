# Inspiration, credits, and independence

React UI/UX Tool is an independent project created by **RA**. Good software is
built on ideas shared by many people, so this page records the products and
open-source projects that helped shape the product brief.

Credit here means **inspiration or technical study**, not copied code, sponsorship,
partnership, certification, or endorsement. Product names and trademarks belong to
their respective owners.

## Visual editing workflow

| Reference | What we learned from it | Relationship to this project |
| --- | --- | --- |
| [Y[wai] / waiVSCode](https://marketplace.visualstudio.com/items?itemName=corernd.wai-vscode) and its [public manual](https://uitool.org/uitool/file/waiVSCode_manual(en).pdf) | A component palette, direct manipulation, alignment tools, and event/value editing can make UI work approachable. | Historical workflow reference only. No Y[wai] code, assets, or proprietary runtime is included. |
| [Codux](https://www.codux.com/) | Visual React editing can keep normal source code as the hand-off format. | Product reference only; no affiliation or bundled Codux code. |
| [Onlook](https://github.com/onlook-dev/onlook) | Local visual selection and source-aware editing patterns. | Independent open-source reference; no source copied. |
| [Puck](https://github.com/puckeditor/puck) | A clear component palette and configurable properties. | Independent open-source reference; not a dependency. |
| [Storybook](https://github.com/storybookjs/storybook) | Isolated component examples and documented states. | Independent open-source reference; not a dependency. |
| [React Grab](https://github.com/aidenybai/react-grab) | Fast selection of rendered React elements. | Independent open-source reference; not a dependency. |
| [Craft.js](https://github.com/prevwong/craft.js) | Editor-node and drag-and-drop concepts. | Independent open-source reference; not a dependency. |
| [SculptUI](https://github.com/sculptui/vscode) | Source-oriented visual editing inside a developer workflow. | Independent open-source reference; not a dependency. |
| [Plasmic](https://github.com/plasmicapp/plasmic) | Visual composition and reusable component concepts. | Product/open-source reference only. No Plasmic platform source is included. |

## Source-editing references

The original design brief also studied [ts-morph](https://github.com/dsherret/ts-morph),
[Recast](https://github.com/benjamn/recast), and
[dnd-kit](https://github.com/clauderic/dnd-kit). They are not installed dependencies.
The current implementation uses TypeScript's compiler API, browser drag events, and
small validated source-span replacements.

## How licenses apply

- This project's original source is available under the [MIT License](LICENSE).
- Packages actually installed by this project retain their own licenses. See
  [Third-party notices](THIRD_PARTY_NOTICES.md), generated from `package-lock.json`.
- Inspiration alone does not import an upstream project's source license into this
  codebase. If upstream code is added later, its license must be reviewed and the
  notice updated before distribution.
- Links point to the upstream owner so readers can verify current authorship,
  trademarks, source, and license terms there.

If a credit is missing or inaccurate, please open a repository issue with the
upstream source and the correction needed.
