# Samra Pay people reference library

This library supplies reusable visual references for the six people images in the public website. The approved coffee hero is reused; the other five images were refined with Nano Banana Pro through Runway on September 5, 2026. The new generation cost was 200 credits ($2.00 before tax).

Open `index.html` to review the set. `manifest.json` maps each stable actor ID to its full-resolution reference, generation prompt, original and derived checksums, task ID, website source and current pages. The names describe creative roles; they are not real customer identities or testimonial claims.

## Reuse an actor

1. Choose one ID: `coffee-hero`, `cafe-professional`, `diaspora-phone`, `values-woman`, `values-man` or `values-elder`.
2. Attach its file from `masters/` as the human reference, tagged `actor`. The current Nano Banana Pro schema supports `referenceImages: [{ uri, tag: "actor", subject: "human" }]`.
3. Describe the new scene, pose and framing while explicitly preserving the referenced person's appearance, apparent age, skin tone and facial proportions. Keep scene instructions separate from the identity reference.
4. Review face, hands, clothing, composition and continuity before accepting a new result. One reference supports reuse but does not guarantee identical appearances across every pose or model. Add approved angles only when a future scene needs them.

Example creative instruction:

> Use @actor as the identity reference for the same adult person. Preserve facial proportions, apparent age, skin tone and hairstyle. Create [scene] with [pose] in [framing]. Use natural editorial light, realistic skin texture and soft anatomical expression lines. Keep the person recognizable and the image free of text or logos.

The generation prompts in `prompts/` record how the current images were made. For fresh requests, the current [Runway API documentation](https://docs.dev.runwayml.com/api.md) is authoritative for field names and model options. A high-resolution reference that exceeds the documented data URI limit must use an appropriate supported input method or a smaller reference derivative; never paste its bytes into chat.

## Characters and actors

[Runway Characters](https://docs.dev.runwayml.com/characters/) creates real-time conversational avatars with voice, personality and knowledge. It is not required for this still-image reference library. An approved reference can inform a later avatar or video project when that interaction is actually needed. No Runway avatar account resources were created for this refresh.

## Website delivery

The full-resolution JPEG references in `masters/` are creative files, outside both `src/` and `public/`. The original generated PNGs remain in the local Runway task output records. Only normalized website sources and their build-time AVIF/WebP derivatives enter the public site's existing image path.

The existing image dimensions, responsive widths, hero preload, fetch priority, lazy loading, cache configuration and byte limits remain in effect. Updating this library does not publish the site. The source changes and production preview are prepared for review and the normal release process.
