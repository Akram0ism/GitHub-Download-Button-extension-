console.log("[GitHub Download] Extension loaded");

/* =====================================================
   Repository info
===================================================== */

function getRepoInfo() {
  const parts = location.pathname.split("/").filter(Boolean);

  if (parts.length < 2) return null;

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

/* =====================================================
   Current branch
===================================================== */

function getBranch() {
  const parts = location.pathname.split("/").filter(Boolean);

  const treeIndex = parts.indexOf("tree");

  if (treeIndex !== -1 && parts[treeIndex + 1]) {
    return parts[treeIndex + 1];
  }

  const branchButton =
    document.querySelector('[data-testid="anchor-button"]');

  if (branchButton) {
    const text = branchButton.textContent.trim();

    if (text) return text;
  }

  return "main";
}

/* =====================================================
   BIG BUTTON — download whole repository
===================================================== */

function findReportRepository() {
  const links = document.querySelectorAll("a");

  for (const link of links) {
    if (link.textContent.trim() === "Report repository") {
      return link;
    }
  }

  return null;
}

function createRepositoryDownloadButton() {
  if (document.getElementById("github-simple-download")) {
    return;
  }

  const repoInfo = getRepoInfo();

  if (!repoInfo) return;

  // Ищем заголовок About
  const headings = document.querySelectorAll("h2, h3");

  let aboutHeading = null;

  for (const heading of headings) {
    if (heading.textContent.trim() === "About") {
      aboutHeading = heading;
      break;
    }
  }

  if (!aboutHeading) {
    console.log("[GitHub Download] About heading not found");
    return;
  }

  // Ищем основной контейнер секции About
  let aboutSection = aboutHeading.parentElement;

  while (aboutSection && aboutSection.parentElement) {
    const parent = aboutSection.parentElement;

    // Останавливаемся на достаточно крупном sidebar-контейнере
    if (
      parent.classList.contains("Layout-sidebar") ||
      parent.getAttribute("data-testid") === "repository-sidebar"
    ) {
      break;
    }

    // Если текущий контейнер уже содержит всё содержимое About
    if (
      aboutSection.querySelector('a[href*="/stargazers"]') ||
      aboutSection.textContent.includes("Report repository")
    ) {
      break;
    }

    aboutSection = parent;
  }

  if (!aboutSection) {
    console.log("[GitHub Download] About section not found");
    return;
  }

  const button = document.createElement("button");

  button.id = "github-simple-download";

  button.innerHTML = `
    <svg
      aria-hidden="true"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      fill="currentColor"
    >
      <path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3-3a.749.749 0 1 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 0 0-1.5 0v6.69L5.53 6.72a.749.749 0 1 0-1.06 1.06l3 3ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"></path>
    </svg>

    <span>Download ZIP</span>
  `;

  button.addEventListener("click", () => {
    const branch = getBranch();

    const url =
      `https://github.com/${repoInfo.owner}/${repoInfo.repo}` +
      `/archive/refs/heads/${encodeURIComponent(branch)}.zip`;

    window.location.href = url;
  });

  // Главное изменение:
  // вставляем кнопку ПЕРЕД секцией About
  aboutSection.insertAdjacentElement("beforebegin", button);

  console.log("[GitHub Download] Button inserted above About");
}

/* =====================================================
   Download single file
===================================================== */

async function downloadFile(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  return await response.blob();
}

/* =====================================================
   Download folder recursively
===================================================== */

async function downloadDirectoryToZip(
  zip,
  owner,
  repo,
  path,
  branch,
  rootPath
) {
  const apiURL =
    `https://api.github.com/repos/${owner}/${repo}/contents/` +
    `${encodeURI(path)}?ref=${encodeURIComponent(branch)}`;

  const response = await fetch(apiURL, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }

  const items = await response.json();

  for (const item of items) {
    const relativePath = item.path
      .substring(rootPath.length)
      .replace(/^\/+/, "");

    if (item.type === "file") {
      const blob = await downloadFile(item.download_url);

      zip.file(relativePath, blob);
    }

    if (item.type === "dir") {
      await downloadDirectoryToZip(
        zip,
        owner,
        repo,
        item.path,
        branch,
        rootPath
      );
    }
  }
}

/* =====================================================
   Folder download
===================================================== */
async function downloadFolder(
  folderPath,
  button,
  forcedBranch = null
) {
  const repoInfo = getRepoInfo();

  if (!repoInfo) return;

  const branch =
    forcedBranch || getBranch();

  const oldHTML = button.innerHTML;

  try {
    button.disabled = true;
    button.innerHTML = "…";

    const zip = new JSZip();

    await downloadDirectoryToZip(
      zip,
      repoInfo.owner,
      repoInfo.repo,
      folderPath,
      branch,
      folderPath
    );

    const blob =
      await zip.generateAsync({
        type: "blob"
      });

    const folderName =
      folderPath.split("/").pop();

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      `${folderName}.zip`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(
      "[GitHub Download]",
      error
    );

    alert(
      "Не удалось скачать папку.\n\n" +
      error.message
    );
  } finally {
    button.disabled = false;
    button.innerHTML = oldHTML;
  }
}
/* =====================================================
   SMALL BUTTONS beside folders
===================================================== */

function addItemDownloadButtons() {
  const repoInfo = getRepoInfo();

  if (!repoInfo) return;

  const repoPrefix = `/${repoInfo.owner}/${repoInfo.repo}/`;

  const links = document.querySelectorAll(
    `a[href^="${repoPrefix}tree/"],
     a[href^="${repoPrefix}blob/"]`
  );

  links.forEach(link => {
    if (link.dataset.downloadButtonAdded === "true") {
      return;
    }

    const row =
      link.closest("tr") ||
      link.closest(".react-directory-row") ||
      link.closest('[role="row"]');

    if (!row) return;

    row.classList.add("github-download-row");

    const hrefParts = link.pathname
      .split("/")
      .filter(Boolean);

    const typeIndex = hrefParts.findIndex(
      part => part === "tree" || part === "blob"
    );

    if (typeIndex === -1) return;

    const type = hrefParts[typeIndex];
    const branch = hrefParts[typeIndex + 1];

    const itemPath = hrefParts
      .slice(typeIndex + 2)
      .join("/");

    if (!itemPath) return;

    const wrapper = document.createElement("span");

    wrapper.className = "github-download-item-wrapper";

    const button = document.createElement("button");

    button.className = "github-item-download";

    button.title =
      type === "tree"
        ? "Download folder"
        : "Download file";

    button.innerHTML = `
      <svg
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="currentColor"
      >
        <path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3-3a.749.749 0 1 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 0 0-1.5 0v6.69L5.53 6.72a.749.749 0 1 0-1.06 1.06l3 3ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"></path>
      </svg>
    `;

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      if (type === "tree") {
        await downloadFolder(
          itemPath,
          button,
          branch
        );
      } else {
        await downloadSingleFile(
          repoInfo.owner,
          repoInfo.repo,
          itemPath,
          branch,
          button
        );
      }
    });

    link.parentNode.insertBefore(wrapper, link);

    wrapper.appendChild(link);
    wrapper.appendChild(button);

    link.dataset.downloadButtonAdded = "true";
  });
}

async function downloadSingleFile(
  owner,
  repo,
  filePath,
  branch,
  button
) {
  const oldHTML = button.innerHTML;

  try {
    button.disabled = true;
    button.innerHTML = "…";

    const url =
      `https://raw.githubusercontent.com/` +
      `${owner}/${repo}/${encodeURIComponent(branch)}/${filePath}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to download file: ${response.status}`
      );
    }

    const blob = await response.blob();

    const objectURL =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = objectURL;

    link.download =
      filePath.split("/").pop();

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(objectURL);
  } catch (error) {
    console.error(
      "[GitHub Download]",
      error
    );

    alert(
      "Не удалось скачать файл.\n\n" +
      error.message
    );
  } finally {
    button.disabled = false;
    button.innerHTML = oldHTML;
  }
}
/* =====================================================
   Main init
===================================================== */

function init() {
  createRepositoryDownloadButton();
  addItemDownloadButtons();
}
init();

const observer = new MutationObserver(() => {
  init();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

setTimeout(init, 500);
setTimeout(init, 1500);
setTimeout(init, 3000);