const ROOT_TERMS = [
    "GO:0008150",
    "GO:0005575",
    "GO:0003674"
];

// Strain filtering configuration
const STRAIN_SOURCE_BLACKLIST = [
    'Beta Cell Biology Consortium',
    'Beutler Mutagenetix',
    'UC Davis NeuroMab Hybridomas'
];

// Strain filtering functions
function isStrainBlacklisted(strain) {
    return strain.source_collection && 
           STRAIN_SOURCE_BLACKLIST.includes(strain.source_collection);
}

function filterAndGroupStrains(strains) {
    const visibleStrains = [];
    const hiddenStrainsByCollection = {};
    
    strains.forEach(strain => {
        if (isStrainBlacklisted(strain)) {
            const collection = strain.source_collection || 'Unknown Source';
            if (!hiddenStrainsByCollection[collection]) {
                hiddenStrainsByCollection[collection] = [];
            }
            hiddenStrainsByCollection[collection].push(strain);
        } else {
            visibleStrains.push(strain);
        }
    });
    
    return { visibleStrains, hiddenStrainsByCollection };
}

async function fetchTerm(id) {
    const res = await fetch(`https://api.spatel.mousebiology.org/api/v1/go/getGoTerm/${encodeURIComponent(id)}`);
    return res.ok ? await res.json() : null;
}

async function fetchChildren(id) {
    const res = await fetch(`https://api.spatel.mousebiology.org/api/v1/go/getChildren/${encodeURIComponent(id)}`);
    return res.ok ? await res.json() : [];
}

async function buildNode(term, container) {
    const li = document.createElement("li");
    li.dataset.id = term.go_id;
    li.dataset.expanded = "false";
    
    const textSpan = document.createElement("span");
    textSpan.classList.add("cursor-pointer", "go-term-text");
    textSpan.textContent = term.name || term.go_id;

    const childrenUL = document.createElement("ul");
    childrenUL.classList.add("ml-4", "space-y-1", "hidden");
    
    li.appendChild(textSpan);
    li.appendChild(childrenUL);

    textSpan.onclick = async (e) => {
    e.stopPropagation();
    showStrains(term);

    const expanded = li.dataset.expanded === "true";
    if (!expanded) {
        if (!li.dataset.loaded) {
        const children = await fetchChildren(term.go_id);
        for (const child of children) {
            const childTerm = await fetchTerm(child.child_go_id);
            if (childTerm) await buildNode(childTerm, childrenUL);
        }
        li.dataset.loaded = "true";
        }
        childrenUL.classList.remove("hidden");
        li.dataset.expanded = "true";
    } else {
        childrenUL.classList.add("hidden");
        li.dataset.expanded = "false";
    }
    };

    container.appendChild(li);
}

async function showStrains(term) {
    const label = document.getElementById("selected-go-label");
    const list = document.getElementById("strain-list");

    label.textContent = `${term.name} (${term.go_id})`;
    list.innerHTML = "<li class='text-gray-500'>Loading strains...</li>";

    try {
        const res = await fetch(`https://api.spatel.mousebiology.org/api/v1/go/getMmrrcStrains/${encodeURIComponent(term.go_id)}`);
        const strains = res.ok ? await res.json() : [];
        
        list.innerHTML = "";
        
        if (strains.length === 0) {
            list.innerHTML = "<li class='text-gray-500'>No strains linked to this term.</li>";
        } else {
            // Filter and group strains by blacklist status
            const { visibleStrains, hiddenStrainsByCollection } = filterAndGroupStrains(strains);
            
            // Display visible strains first
            visibleStrains.forEach(strain => {
                const li = document.createElement("li");
                const link = document.createElement("a");
                link.href = `https://www.mmrrc.org/catalog/sds.php?mmrrc_id=${strain.mmrrc_id}`;
                link.textContent = strain.mmrrc_id;
                link.classList.add("hover:underline");
                li.appendChild(link);
                list.appendChild(li);
            });
            
            // Add hidden strains sections grouped by collection
            const collectionNames = Object.keys(hiddenStrainsByCollection);
            if (collectionNames.length > 0) {
                // Add separator
                const separatorLi = document.createElement("li");
                separatorLi.className = "mt-4 pt-2 border-t border-gray-200";
                
                collectionNames.forEach(collection => {
                    const collectionStrains = hiddenStrainsByCollection[collection];
                    const collectionId = collection.replace(/\s+/g, '-').toLowerCase();
                    
                    // Create collection section
                    const collectionDiv = document.createElement("div");
                    collectionDiv.className = "mb-3";
                    
                    // Create toggle button for this collection
                    const toggleButton = document.createElement("button");
                    toggleButton.id = `toggle-collection-${collectionId}-${term.go_id}`;
                    toggleButton.className = "text-sm text-gray-600 hover:text-blue-600 cursor-pointer underline";
                    toggleButton.textContent = `Show ${collectionStrains.length} ${collection}`;
                    
                    // Create hidden strains container for this collection
                    const hiddenContainer = document.createElement("ol");
                    hiddenContainer.id = `collection-strains-${collectionId}-${term.go_id}`;
                    hiddenContainer.className = "mt-2 hidden list-decimal list-inside space-y-1";
                    
                    // Add strains from this collection
                    collectionStrains.forEach(strain => {
                        const li = document.createElement("li");
                        li.className = "px-2 py-1 rounded bg-red-50 border-l-2 border-red-200";
                        
                        const link = document.createElement("a");
                        link.href = `https://www.mmrrc.org/catalog/sds.php?mmrrc_id=${strain.mmrrc_id}`;
                        link.textContent = strain.mmrrc_id;
                        link.classList.add("hover:underline");
                        
                        const sourceDiv = document.createElement("div");
                        sourceDiv.className = "text-xs text-gray-500";
                        sourceDiv.textContent = strain.source_collection || 'Unknown Source';
                        
                        li.appendChild(link);
                        li.appendChild(sourceDiv);
                        hiddenContainer.appendChild(li);
                    });
                    
                    collectionDiv.appendChild(toggleButton);
                    collectionDiv.appendChild(hiddenContainer);
                    separatorLi.appendChild(collectionDiv);
                    
                    // Add toggle functionality for this collection
                    let isVisible = false;
                    toggleButton.addEventListener('click', () => {
                        isVisible = !isVisible;
                        if (isVisible) {
                            hiddenContainer.classList.remove('hidden');
                            toggleButton.textContent = `Hide ${collectionStrains.length} ${collection}`;
                        } else {
                            hiddenContainer.classList.add('hidden');
                            toggleButton.textContent = `Show ${collectionStrains.length} ${collection}`;
                        }
                    });
                });
                
                list.appendChild(separatorLi);
            }
        }
    } catch (error) {
        list.innerHTML = "<li class='text-red-500'>Error loading strains.</li>";
        console.error('Error fetching strains:', error);
    }
}

async function init() {
    const tree = document.getElementById("go-tree");
    for (const id of ROOT_TERMS) {
    const term = await fetchTerm(id);
    if (term) buildNode(term, tree);
    }
}

init();