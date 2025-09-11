# Vendor jsMind Modifications (Tracking)

This document records local modifications applied to the vendored jsMind source under `vendor/jsmind-repo/`. Keep this file up to date whenever the vendor code is changed.

## Summary

- Switch inline editor from `input` to `textarea` for multi-line editing and autosize behavior.
- Improve editor key handling: use Ctrl/Cmd+Enter to commit; plain Enter inserts newline.
- Add autosize (height) on input and on edit begin.

## Files Changed

- `vendor/jsmind-repo/src/jsmind.view_provider.js`
  - In `init()`: create editor with `$.c('textarea')` instead of `input`.
  - Remove/avoid setting `type` on editor (textarea has readonly `type`).
  - Set base styles/attrs: `rows=1`, `wrap='soft'`, `resize='none'`, `overflow='hidden'`.
  - Register `input` handler for autosize: `height='auto'` then `height=scrollHeight + 'px'`.
  - Update `keydown` handler: commit only on Ctrl/Cmd+Enter; prevent bubbling for plain Enter.
  - In `edit_node_begin(node)`: after focus/select, autosize once and again on next animation frame to account for layout.

  Code snippets (for reference):

  ```js
  // init()
  this.e_editor = $.c('textarea');
  this.e_editor.className = 'jsmind-editor';
  this.e_editor.style.resize = 'none';
  this.e_editor.style.overflow = 'hidden';
  this.e_editor.rows = 1;
  this.e_editor.wrap = 'soft';

  $.on(this.e_editor, 'keydown', function (e) {
      var evt = e || event;
      var isEnter = (evt.key === 'Enter' || evt.keyCode === 13);
      if (isEnter && (evt.ctrlKey || evt.metaKey)) {
          v.edit_node_end();
          evt.stopPropagation();
          evt.preventDefault();
      } else {
          if (isEnter) evt.stopPropagation();
      }
  });

  $.on(this.e_editor, 'input', function () {
      try {
          this.style.height = 'auto';
          this.style.height = this.scrollHeight + 'px';
      } catch (e) {}
  });
  ```

  ```js
  // edit_node_begin(node)
  this.e_editor.value = topic;
  this.e_editor.style.width = element.clientWidth - paddingL - paddingR + 'px';
  element.innerHTML = '';
  element.appendChild(this.e_editor);
  element.style.zIndex = 5;
  this.e_editor.focus();
  this.e_editor.select();
  try {
      this.e_editor.style.height = 'auto';
      this.e_editor.style.height = this.e_editor.scrollHeight + 'px';
      if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
              try {
                  this.e_editor.style.height = 'auto';
                  this.e_editor.style.height = this.e_editor.scrollHeight + 'px';
              } catch (e) {}
          });
      }
  } catch (e) {}
  ```

## Rationale

- Multi-line node editing is required; `textarea` supports native wrapping and selection APIs.
- Prevent CSP/layout issues by avoiding excessive CSS overrides; changes are kept minimal and localized.

## Diff Highlights (conceptual)

- Before:
  - `this.e_editor = $.c('input');`
  - `this.e_editor.type = 'text';`
  - `keydown: Enter => commit`
- After:
  - `this.e_editor = $.c('textarea');`
  - No `type` assignment; `rows=1`, `wrap='soft'`, autosize on input.
  - `keydown: Ctrl/Cmd+Enter => commit; Enter => newline`

## Build & Sync

- Build jsMind from vendor repo and copy artifacts:
  - macOS/Linux: `./build-jsmind.sh`
  - Or full plugin build+deploy: `./build-plugin.sh [DEST]`
- Artifacts copied to `vendor/jsmind/`:
  - `vendor/jsmind/es6/jsmind.js`
  - `vendor/jsmind/style/jsmind.css`

## Upgrading Vendor

When updating `vendor/jsmind-repo` to a newer upstream revision:
1. Re-apply the changes listed above (or cherry-pick your local commits if you keep a fork).
2. Run `./build-jsmind.sh` and verify editing works (multi-line, autosize, commit shortcut).
3. Update this document if the patch locations or behavior change.
