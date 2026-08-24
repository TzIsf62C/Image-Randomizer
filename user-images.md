You are working in Planning mode. Do not modify files or implement code yet.

Inspect the repository and create a detailed, repository-specific implementation plan for adding user-managed images, editable image metadata, managed categories and sets, image exclusion, export/import, and scalable history support.

Base the plan on the actual repository architecture, conventions, framework, storage utilities, data-loading code, reel-generation logic, history feature, PWA behavior, and test setup. Do not assume that the repository matches the proposed design below without verifying it.

Clearly distinguish:

- Verified repository findings.
- Proposed implementation decisions.
- Product decisions that still require confirmation.
- Browser/platform limitations.

# Objective

Allow users to:

1. Add their own SVG and raster images to the app.
2. Reuse those images in later sessions without selecting them again.
3. Edit metadata for user-added images.
4. Edit category assignments for both native and user-added images.
5. Create, rename, and delete categories.
6. Assign any number of category tags to an image.
7. Edit set assignments for both native and user-added images.
8. Create, rename, and delete sets.
9. Assign any number of set tags to an image.
10. Exclude native or user-added images from appearing in reels.
11. Restore previously excluded images.
12. View history containing potentially several hundred thumbnails.
13. Export user data to a portable archive.
14. Import that data on another device, such as moving from a phone to a laptop.
15. Export and import user images, image metadata, categories, sets, overrides, and history where appropriate.
16. Work offline wherever the existing PWA architecture supports it.

# Existing metadata

The application currently has a bundled metadata file:

```text
metadata/images.json
```

A typical entry is:

```json
{
  "id": "cow",
  "file": "mp1/cow.svg",
  "setName": "Meeting Plan 1",
  "categories": [
    "noun",
    "animal",
    "animate"
  ],
  "rights": {
    "creator": "CREATOR NAME",
    "copyrightNotice": "© 2026 CREATOR NAME",
    "license": "All rights reserved.",
    "source": "internal"
  }
}
```

The current `source` value is intended to distinguish application-native images from user-added images.

Inspect how `source`, `setName`, and `categories` are currently used throughout the repository. Recommend whether to introduce a separate system-controlled field:

```ts
origin: "native" | "user"
```

Prefer separating image origin/provenance from rights attribution:

```ts
origin: "native" | "user"

rights: {
  creator: string
  copyrightNotice: string
  license: string
  source: string
}
```

Do not change the bundled JSON format without explaining why and how all existing consumers will be migrated.

# Native image requirements

Built-in/native images:

- Must not be permanently deleted from the application.
- Must retain their bundled image files.
- Must retain their bundled rights metadata.
- Must not allow users to edit the `rights` object.
- Must allow users to edit category assignments.
- Must allow users to edit set assignments.
- Must allow users to exclude the image from reels.
- Must allow users to restore an excluded image.
- Should continue receiving future changes from the bundled `metadata/images.json` where appropriate.

Prefer storing only user overrides for native images instead of copying entire native records into user storage:

```js
{
  imageId: "cow",
  categoryIds: ["noun", "animal"],
  setIds: ["meeting-plan-1"],
  excluded: true,
  updatedAt: "..."
}
```

Explain how the effective native image record will be constructed by merging:

```text
bundled native record
+
user-editable override
```

Explain what happens when an application update changes native image metadata, rights, filenames, categories, or sets.

# User-added image requirements

Users should be able to add SVG and raster images through an appropriate existing or new UI.

For user-added images:

- Store the image data in IndexedDB or the repository’s existing client-side persistence layer.
- Do not rely on an absolute filesystem path in `localStorage`.
- Do not rely on a temporary object URL as a persistent reference.
- Store a stable application-generated image ID.
- Store the image `Blob` or `File` separately from metadata if that fits the repository’s storage patterns.
- Preserve useful metadata such as filename, MIME type, dimensions, timestamps, and original size.
- Allow category assignment and editing.
- Allow set assignment and editing.
- Allow rights metadata editing.
- Allow exclusion from reels.
- Determine whether user-added images may be permanently deleted.
- Define what happens to history references, metadata, blobs, and overrides when a user image is deleted.

Distinguish between:

1. Image data/blob.
2. Image metadata.
3. Native-image user overrides.
4. Category definitions.
5. Set definitions.
6. Image-to-category assignments.
7. Image-to-set assignments.
8. Visibility/exclusion state.
9. History references.
10. Exported files.

# Raster image processing

The portable raster master must have a maximum dimension of **1200 pixels on its longest side**.

This is an application-level portable master limit, not a device-specific reel-size limit.

For raster imports:

- Preserve the original file if the repository design and storage budget justify doing so, or create a portable master capped at 1200px.
- If creating a processed master, resize so the longest dimension is no greater than 1200px.
- Preserve the original aspect ratio.
- Use WebP or another suitable raster format.
- Use an appropriate quality setting; investigate whether approximately `0.85–0.9` is suitable.
- Do not resize the permanent master based on the current device’s CSS reel size or `devicePixelRatio`.
- The portable master must work when exported from a phone and imported on a laptop, or vice versa.
- Do not create multiple device-specific permanent masters unless the repository has a compelling reason.
- Display-time scaling may use the current reel size and device pixel ratio.
- Optional thumbnails may be generated separately for history performance.

The current reel sizing CSS is:

```css
--max-reel-size: min(
  calc((100vw - (2 * var(--screen-padding)) - var(--controls-column-width) - ((var(--slot-count) - 1) * var(--reel-gap))) / var(--slot-count)),
  calc(100dvh - var(--controls-height) - (2 * var(--screen-padding)) - var(--controls-gap))
);

--reel-size: clamp(
  var(--reel-min-size),
  var(--max-reel-size),
  260px
);
```

The current laptop reel may display at approximately 520 CSS pixels on a high-density Liquid Retina display. Do not assume that 260px is the universal maximum. Inspect the actual layout and measure the rendered element with `getBoundingClientRect()` where appropriate.

For runtime display:

- Use actual rendered dimensions.
- Account for `window.devicePixelRatio`.
- Do not let runtime DPR determine the exported portable master dimensions.
- Respect existing `object-fit`, cropping, and aspect-ratio behavior.

For SVGs:

- Store the original SVG when it is genuinely vector-based.
- Do not rasterize it merely because the reel has a particular size.
- Check whether SVGs can contain embedded PNG/JPEG/WebP content.
- Explain how embedded raster content affects portability and quality.

# Categories as managed tags

Categories must be managed global entities, not only arbitrary strings embedded in image records.

Users must be able to:

- Create categories.
- Rename categories.
- Delete categories.
- Add any number of category tags to an image.
- Remove individual category tags from an image.
- Filter images and generate reels using categories.

Prefer stable category IDs:

```js
{
  id: "animal",
  name: "Animal",
  origin: "native" | "user",
  createdAt: "...",
  updatedAt: "..."
}
```

Images should refer to category IDs:

```js
{
  imageId: "cow",
  categoryIds: [
    "noun",
    "animal",
    "animate"
  ]
}
```

Renaming a category should change its display name without changing its ID or losing image associations.

The plan must define:

- Whether native categories are immutable.
- Whether users can rename native categories.
- Whether users can delete native categories.
- Whether native category overrides or aliases are needed.
- What deleting a category does to image assignments.
- Whether deletion removes assignments or archives the category.
- Whether deleted categories can be restored.
- Duplicate-name rules.
- Case-insensitive matching rules.
- Trimming and validation rules.
- Localization behavior.

Do not use an empty category list to mean “hidden.” Visibility must be independent and use an explicit field such as:

```js
excluded: true
```

# Sets as managed tags

The existing singular field:

```js
"setName": "Meeting Plan 1"
```

must be evaluated for migration to a many-to-many tag model.

Users must be able to:

- Create sets.
- Rename sets.
- Delete sets.
- Add any number of set tags to an image.
- Remove individual set tags from an image.
- Filter or organize images by sets.
- Assign an image to multiple sets.

Prefer stable set IDs:

```js
{
  id: "meeting-plan-1",
  name: "Meeting Plan 1",
  origin: "native" | "user",
  createdAt: "...",
  updatedAt: "..."
}
```

Images should refer to set IDs:

```js
{
  imageId: "cow",
  setIds: [
    "meeting-plan-1",
    "farm-vocabulary"
  ]
}
```

The plan must address:

- Migration from `setName` to `setIds`.
- Whether existing native set names become native set definitions.
- Whether native sets are immutable.
- Whether users may rename or delete native sets through overrides.
- What deleting a set does to image assignments.
- Whether deleted sets can be restored.
- Duplicate-name and case-insensitive matching rules.
- Validation and localization.
- Compatibility with current reel filters, search, and UI labels.
- Whether sets have existing behavior beyond being tags.

The image editor should present categories and sets as multi-select tag editors:

```text
Categories:
  [noun] [animal] [+ Add category]

Sets:
  [Meeting Plan 1] [+ Add set]
```

Users should be able to create a new category or set directly from the image metadata editor if this fits the existing UX.

# Metadata permissions

Enforce permissions in both the UI and the persistence/data layer.

At minimum:

| Field or operation | Native image | User-added image |
|---|---:|---:|
| Edit category assignments | Yes | Yes |
| Edit set assignments | Yes | Yes |
| Edit rights metadata | No | Yes |
| Exclude from reels | Yes | Yes |
| Restore to reels | Yes | Yes |
| Permanently delete image | No | Determine and document |
| Change `origin` | No | No |

The plan must ensure:

- Native rights cannot be edited through direct persistence calls.
- Native images cannot be permanently deleted.
- Categories can be edited for both origins.
- Sets can be edited for both origins.
- `origin` is system-controlled.
- `excluded` is user-controlled.
- Invalid categories, sets, rights, duplicate IDs, malformed records, and corrupt image data are handled safely.
- The UI does not provide the only permission enforcement.

# Image exclusion and reel filtering

Users must be able to exclude any image from appearing in reels without deleting it.

Use an explicit property such as:

```js
excluded: true
```

The plan should explain:

- Where exclusion state is stored.
- How it applies to native and user-added images.
- How excluded images are filtered from reel candidates.
- How users view and restore excluded images.
- Whether excluded images remain searchable or visible in management screens.
- How exclusion interacts with category and set filters.
- How native exclusion overrides are stored.

The conceptual pipeline is:

```text
load bundled native records
load user-added records
load native overrides
load category definitions
load set definitions
merge effective metadata
remove excluded images
apply category/set filters
generate reels
```

# Export and import requirements

Users must be able to export their user data and import it on another device.

The export must support, as appropriate:

- User-added image files.
- User image metadata.
- User image rights metadata.
- Native-image category overrides.
- Native-image set overrides.
- Native-image exclusion overrides.
- User-created categories.
- User-created sets.
- Category assignments.
- Set assignments.
- Image IDs.
- History records, if product behavior supports exporting history.
- Any necessary schema or application version information.

The export must be device-neutral. It must not contain:

- Absolute filesystem paths.
- Temporary object URLs.
- Browser-specific IndexedDB implementation details.
- Device-specific reel dimensions.
- Device-specific `devicePixelRatio` values as image-storage requirements.
- Unportable file handles as the only image reference.

Propose a versioned archive format similar to:

```text
export archive
├── manifest.json
├── metadata/
│   ├── images.json
│   ├── categories.json
│   ├── sets.json
│   ├── overrides.json
│   └── history.json
└── images/
    ├── user-image-1.webp
    ├── user-image-2.svg
    └── user-image-3.jpg
```

Example manifest:

```json
{
  "format": "app-data-export",
  "version": 1,
  "createdAt": "2026-08-24T00:00:00.000Z",
  "application": "your-app"
}
```

Example exported user image record:

```json
{
  "id": "user-8f2c",
  "blobFile": "images/user-8f2c.webp",
  "mimeType": "image/webp",
  "fileName": "my-image.webp",
  "width": 1200,
  "height": 900,
  "categoryIds": ["animal"],
  "setIds": ["farm-vocabulary"],
  "excluded": false,
  "rights": {
    "creator": "",
    "copyrightNotice": "",
    "license": "",
    "source": "user"
  }
}
```

The plan must determine:

- Whether to use ZIP, another archive format, or an existing repository mechanism.
- Whether export/import should run entirely in the browser.
- How large exports are handled.
- Whether export files should be streamed or assembled in memory.
- How archive integrity is validated.
- How schema versions are handled.
- How duplicate IDs are resolved.
- Whether imported user-created taxonomy names conflict with existing names.
- Whether IDs should be preserved or remapped.
- How references are repaired when an import is incomplete.
- Whether history should be exported by default or optionally.
- Whether native bundled assets should be exported or only user data and overrides.
- How import progress, errors, cancellation, and confirmation work.

Recommended default behavior to evaluate:

- Do not export bundled native image files.
- Export native-image user overrides.
- Export user-created categories and sets.
- Export user-added image files and metadata.
- Preserve stable IDs where safe.
- Use conflict-resolution rules for existing IDs.
- Import portable raster masters capped at 1200px longest dimension.
- Rebuild optional device-specific thumbnails after import.

# Large history requirements

The history feature may contain substantially more than 100 thumbnails.

For example:

- 5 reels per spin.
- 40 spins.
- 200 image occurrences.

Do not assume a 100-item limit. Inspect the history model and UI and plan for at least several hundred entries.

The plan must address:

- Whether history stores image IDs rather than image blobs.
- Whether duplicate occurrences remain separate.
- Whether each reel slot gets a history record.
- How native and user-added images are resolved.
- What happens when a referenced user image is deleted.
- Ordering and timestamps.
- Clearing all history.
- Partial deletion, if supported.
- Lazy loading.
- Pagination.
- Windowing or virtualization.
- Object URL creation and revocation.
- Decoded bitmap memory.
- Whether a separate thumbnail variant is needed.
- Existing framework support for virtual lists.
- Accessibility for a large history collection.

Compare:

1. Rendering every thumbnail immediately.
2. Lazy-loading thumbnails near the viewport.
3. Pagination.
4. Virtualization/windowing.
5. Combining lazy loading with virtualization.

Do not choose based only on database size. Consider DOM size, decoding, memory, layout, and scrolling performance on mobile devices.

A likely history record is:

```js
{
  id: "history-...",
  imageId: "cow",
  reelId: "reel-...",
  slotIndex: 2,
  createdAt: "2026-08-24T12:00:00.000Z"
}
```

Reuse canonical image blobs. Do not duplicate image data for every history occurrence.

# Proposed data model

Inspect the repository before selecting the final schema. Evaluate a normalized model similar to:

```js
// Image metadata
{
  id: "cow",
  origin: "native" | "user",

  // Native assets may use a bundled path:
  file: "mp1/cow.svg",

  // User assets may use a blob key:
  blobKey: null,

  fileName: "cow.svg",
  mimeType: "image/svg+xml",

  categoryIds: [
    "noun",
    "animal",
    "animate"
  ],

  setIds: [
    "meeting-plan-1"
  ],

  rights: {
    creator: "CREATOR NAME",
    copyrightNotice: "© 2026 CREATOR NAME",
    license: "All rights reserved.",
    source: "internal"
  },

  excluded: false,
  createdAt: "...",
  updatedAt: "..."
}
```

```js
// Category definition
{
  id: "animal",
  name: "Animal",
  origin: "native" | "user",
  createdAt: "...",
  updatedAt: "..."
}
```

```js
// Set definition
{
  id: "meeting-plan-1",
  name: "Meeting Plan 1",
  origin: "native" | "user",
  createdAt: "...",
  updatedAt: "..."
}
```

```js
// Native-image user override
{
  imageId: "cow",
  categoryIds: ["noun", "animal", "farm"],
  setIds: ["meeting-plan-1"],
  excluded: true,
  updatedAt: "..."
}
```

```js
// History occurrence
{
  id: "history-...",
  imageId: "cow",
  reelId: "reel-...",
  slotIndex: 0,
  createdAt: "..."
}
```

Do not impose this exact schema without repository analysis. Explain any deviations.

# Storage and persistence

Inspect current use of:

- `localStorage`.
- IndexedDB.
- Cache Storage.
- Service workers.
- Svelte stores or other state management.
- File picker APIs.
- File System Access API.
- Server-side persistence.
- Existing import/export utilities.

Recommend the smallest coherent storage design that fits the application.

The plan must include:

- IndexedDB database/object-store schema, if appropriate.
- Keys and indexes.
- Database versioning.
- Migration strategy.
- Initialization behavior.
- Native data loading.
- User override merging.
- Image blob handling.
- Missing-blob behavior.
- Missing-taxonomy behavior.
- Quota errors.
- Storage estimation.
- Persistent storage considerations.
- Export/import integration.
- Cross-device limitations.
- Whether server/cloud storage is needed for synchronization.

# Migration requirements

Address migration from:

```js
{
  setName: "Meeting Plan 1",
  categories: ["noun", "animal"]
}
```

to a normalized model such as:

```js
{
  setIds: ["meeting-plan-1"],
  categoryIds: ["noun", "animal"]
}
```

The migration must be:

- Idempotent.
- Safe to run more than once.
- Able to preserve native metadata.
- Able to handle duplicate category or set names.
- Able to handle missing or malformed values.
- Covered by automated tests.

Explain whether:

- The bundled JSON should be migrated at build time.
- A compatibility adapter should temporarily expose `setName` and `categories`.
- All consumers can be updated in one coordinated change.
- User overrides need their own migration.
- Existing history needs migration.
- Existing reel filters need migration.
- Export archives need schema-version migration.

# UI and UX scope

Identify required UI changes, including:

- Add/import image control.
- Metadata editing form.
- Category tag editor.
- Set tag editor.
- Create-category flow.
- Rename-category flow.
- Delete-category flow.
- Create-set flow.
- Rename-set flow.
- Delete-set flow.
- Rights editing for user images.
- Read-only rights display for native images.
- Include/exclude toggle.
- Hidden-image management and restoration.
- User-image deletion, if supported.
- Export control.
- Import control.
- Import preview and confirmation.
- Export/import progress.
- Processing progress.
- Error and cancellation states.
- Storage/quota warnings.
- Large-history loading states.
- Confirmation dialogs.
- Accessibility labels.
- Keyboard navigation.
- Focus management.
- Screen-reader feedback.
- Localization implications.

Reuse existing components, styles, forms, dialogs, stores, validation, and notification patterns.

# Testing requirements

Inspect the existing test framework and propose tests for:

## Images

- Loading bundled native metadata.
- Adding SVG images.
- Adding raster images.
- Persisting images across sessions.
- Resolving image blobs.
- Handling missing blobs.
- Editing user-image metadata.
- Preventing native-rights edits.
- Preventing native-image deletion.
- Deleting user images, if supported.
- Excluding and restoring images.
- 1200px portable raster-master processing.
- SVG preservation.
- Device-neutral export/import behavior.

## Categories

- Creating a category.
- Renaming without losing associations.
- Deleting a category.
- Removing deleted-category assignments.
- Adding multiple category tags to one image.
- Removing one tag while preserving others.
- Editing native-image assignments.
- Editing user-image assignments.
- Duplicate and case-insensitive name handling.
- Invalid-name validation.
- Native category permission behavior.

## Sets

- Creating a set.
- Renaming without losing associations.
- Deleting a set.
- Removing deleted-set assignments.
- Assigning multiple sets to one image.
- Removing one set while preserving others.
- Migrating `setName`.
- Filtering by sets.
- Duplicate and case-insensitive name handling.
- Native set permission behavior.

## Reels

- Excluding native images.
- Excluding user images.
- Restoring excluded images.
- Filtering by categories.
- Filtering by sets.
- Combining category and set filters.
- Handling images with no tags.
- Ensuring exclusion is independent of empty tags.

## Export/import

- Exporting user images.
- Exporting raster masters capped at 1200px.
- Exporting SVGs.
- Exporting image metadata.
- Exporting user-created categories.
- Exporting user-created sets.
- Exporting native-image overrides.
- Exporting history if supported.
- Importing on a fresh device/profile.
- Importing into an app with existing data.
- Duplicate ID handling.
- Name conflicts.
- Missing files.
- Corrupt archives.
- Unsupported archive versions.
- Partial import failures.
- Import cancellation.
- Export cancellation.
- Round-trip export/import equivalence.

## History

- Storing multiple occurrences of the same image.
- Storing at least 200 entries.
- Preserving reel and slot information.
- Resolving native and user image IDs.
- Handling deleted or missing user images.
- Clearing history.
- Partial deletion, if supported.
- Lazy loading.
- Pagination or virtualization.
- Releasing object URLs.
- Maintaining usable performance with several hundred entries.

## Accessibility and offline behavior

- Accessible import/export controls.
- Accessible tag editing.
- Accessible dialogs and confirmations.
- Keyboard navigation.
- Screen-reader announcements.
- Offline image availability.
- Offline metadata editing.
- Offline taxonomy editing.
- Offline history rendering.

Identify which tests should be unit, integration, component, end-to-end, performance, accessibility, or manual browser/device tests.

# Required plan format

Return a detailed implementation plan with these sections:

1. **Repository findings**
   - Relevant files, directories, components, stores, utilities, routes, and tests.
   - Current data flow.
   - Current metadata model.
   - Current reel-generation flow.
   - Current history flow.
   - Current persistence approach.
   - Current PWA/service-worker behavior.
   - Architectural constraints and unknowns.

2. **Proposed architecture**
   - Native metadata handling.
   - User image records.
   - Image blob storage.
   - Native-image overrides.
   - Category definitions.
   - Set definitions.
   - Image-to-category assignments.
   - Image-to-set assignments.
   - Exclusion state.
   - History references.
   - Export/import archive.

3. **Data model and schema**
   - Concrete TypeScript interfaces or equivalent.
   - Object stores, keys, indexes, and relationships.
   - Native versus user-owned records.
   - Rights rules.
   - Category/set relationships.
   - Migration from `categories` and `setName`.

4. **Taxonomy model**
   - Category creation, editing, deletion, and assignment.
   - Set creation, editing, deletion, and assignment.
   - Stable IDs.
   - Rename semantics.
   - Delete semantics.
   - Native versus user-owned definitions.
   - Validation and duplicate handling.

5. **Import and image-processing flow**
   - SVG handling.
   - Raster handling.
   - 1200px portable master.
   - Runtime display scaling.
   - Device-pixel-ratio handling.
   - Optional thumbnails.
   - Object URL lifecycle.
   - Errors, cancellation, and quota behavior.

6. **Metadata editing and permissions**
   - Editable fields by image origin.
   - Category tag editing.
   - Set tag editing.
   - Rights editing.
   - Exclusion and restoration.
   - Persistence-layer enforcement.

7. **Reel and history integration**
   - Candidate filtering.
   - Canonical image IDs.
   - History data model.
   - Several-hundred-entry support.
   - Thumbnail strategy.
   - Lazy loading, pagination, or virtualization.
   - Memory and object URL management.

8. **Export/import architecture**
   - Archive format.
   - Manifest and schema version.
   - Included data.
   - Image-file handling.
   - ID preservation/remapping.
   - Conflict handling.
   - Validation.
   - Progress and cancellation.
   - Round-trip behavior.

9. **UI/UX implementation plan**
   - Components and routes to change or add.
   - Import flow.
   - Export flow.
   - Metadata editor.
   - Taxonomy management.
   - Hidden-image management.
   - History UI.
   - Accessibility and localization.

10. **Migration and compatibility**
    - Existing `metadata/images.json`.
    - Migration from `setName`.
    - Migration from category strings.
    - Existing stores and consumers.
    - Existing history records.
    - Service-worker/cache behavior.
    - Database versioning.
    - Export schema migration.

11. **Testing plan**
    - Specific test files or locations.
    - Unit tests.
    - Integration tests.
    - Component tests.
    - End-to-end tests.
    - Performance tests.
    - Accessibility tests.
    - Manual browser/device tests.

12. **Phased implementation sequence**
    - Divide the work into small, reviewable phases.
    - Identify dependencies.
    - Identify safe migration checkpoints.
    - Identify the first phase to implement.

13. **Risks, trade-offs, and open questions**
    - Browser support.
    - Storage quota and eviction.
    - Cross-device limitations.
    - SVG and raster edge cases.
    - Taxonomy ownership.
    - Native-record mutability.
    - Large-history performance.
    - User-image deletion behavior.
    - Export/import conflicts.
    - Any product decisions requiring confirmation.

14. **Files likely to change**
    - Existing files to modify.
    - New files to create.
    - Do not invent exact paths if the repository does not support them; state what must be located instead.

Do not write implementation code yet. Do not make speculative changes. Inspect the repository thoroughly and base the plan on its actual patterns. Explicitly distinguish verified repository findings from proposed design decisions and unresolved product questions.