const imageAssets = [];
const byId = (selector) => document.querySelector(selector);
const formatBytes = (bytes) => {
    if (bytes < 1024)
        return bytes + " B";
    if (bytes < 1024 * 1024)
        return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};
function showImageProperties(asset) {
    const inspector = byId("#stInspector");
    if (!inspector)
        return;
    inspector.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "st-inspector-name";
    heading.textContent = asset.file.name;
    const preview = document.createElement("img");
    preview.className = "st-image-property-preview";
    preview.src = asset.url;
    preview.alt = asset.file.name;
    const meta = document.createElement("p");
    meta.className = "st-hint";
    meta.textContent = asset.width + " × " + asset.height + " · " + formatBytes(asset.file.size);
    const note = document.createElement("p");
    note.className = "st-hint";
    note.textContent = "Image imported into this temporary media library.";
    inspector.append(heading, preview, meta, note);
    const selection = byId("#stSelection");
    if (selection)
        selection.textContent = asset.file.name;
}
let lastMediaSignature = "";
function renderImages() {
    const mediaRoot = byId("#stMedia");
    if (!mediaRoot)
        return;
    const signature = Array.from(mediaRoot.children)
        .filter((node) => !node.classList.contains("st-image-item"))
        .map((node) => node.textContent || "")
        .join("|") + "|" + imageAssets.length;
    if (signature === lastMediaSignature && mediaRoot.querySelector(".st-image-item"))
        return;
    lastMediaSignature = signature;
    mediaRoot.querySelectorAll(".st-image-item").forEach((node) => node.remove());
    imageAssets.forEach((asset) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "st-media-item st-image-item";
        item.setAttribute("aria-label", "Preview image " + asset.file.name);
        const thumbnail = document.createElement("img");
        thumbnail.className = "st-image-thumb";
        thumbnail.src = asset.url;
        thumbnail.alt = "";
        const details = document.createElement("span");
        const name = document.createElement("b");
        name.textContent = asset.file.name;
        const meta = document.createElement("small");
        meta.textContent = asset.width + " × " + asset.height + " · Image";
        details.append(name, meta);
        item.append(thumbnail, details);
        item.addEventListener("click", () => showImageProperties(asset));
        mediaRoot.append(item);
    });
}
function mountEditorLayout() {
    const editorCard = byId('.toolcard[href="#editor"]');
    if (editorCard) {
        editorCard.innerHTML =
            '<span class="ttag">MULTI-TRACK WORKSPACE</span>' +
                "<h3>Video Editor</h3>" +
                "<p>A focused workspace for arranging and preparing your media.</p>" +
                "<ul>" +
                "<li>Import video, audio and image assets</li>" +
                "<li>Dedicated preview and clip properties panel</li>" +
                "<li>Visual timeline with video, text and audio lanes</li>" +
                "<li>Designed for desktop and mobile screens</li>" +
                "</ul><span class=\"go\">Open workspace ↗</span>";
    }
    const input = byId("#stImport");
    const label = byId('label[for="stImport"]');
    if (label)
        label.innerHTML = "＋ Import media<small>Video · Audio · Image</small>";
    if (input) {
        input.accept = "video/*,audio/*,image/*";
        const previousHandler = input.onchange;
        input.onchange = () => {
            const files = Array.from(input.files || []);
            const videoAndAudio = files.filter((file) => file.type.startsWith("video/") || file.type.startsWith("audio/"));
            const images = files.filter((file) => file.type.startsWith("image/"));
            if (videoAndAudio.length && typeof previousHandler === "function") {
                previousHandler.call(input, {
                    target: { files: videoAndAudio, value: "" }
                });
            }
            input.value = "";
            images.forEach((file) => {
                const url = URL.createObjectURL(file);
                const image = new Image();
                image.onload = () => {
                    const asset = {
                        id: crypto.randomUUID(),
                        file,
                        url,
                        image,
                        width: image.naturalWidth,
                        height: image.naturalHeight
                    };
                    imageAssets.push(asset);
                    window.dispatchEvent(new CustomEvent("clipforge:image-imported", { detail: asset }));
                };
                image.onerror = () => URL.revokeObjectURL(url);
                image.src = url;
            });
        };
    }
    window.addEventListener("beforeunload", () => {
        imageAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountEditorLayout, { once: true });
}
else {
    mountEditorLayout();
}
export {};
