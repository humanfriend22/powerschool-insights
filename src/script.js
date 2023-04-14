const getTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return [tab.id, tab.url];
};

let targetGrade = 4;

function calculateDistance(grades) {
    let sum = grades.sum;

    let grade = sum / grades.count,
        tempSum = sum;

    while (grade < targetGrade - 0.5) {
        tempSum++;
        grade = tempSum / grades.count;
    };

    return tempSum - sum;
};

function calculateLeeway(grades) {
    let sum = grades.sum;

    let grade = sum / grades.count,
        tempSum = sum;



    while (grade > targetGrade - 0.5) {
        tempSum--;
        grade = tempSum / grades.count;
    };

    return Math.abs(tempSum - sum);
}

let lastResult = false;
const start = async () => {
    const [id, url] = await getTab();

    const isPowerschool = url.includes('guardian/scores.html');
    document.querySelectorAll('section')[isPowerschool ? 0 : 1].style.display = 'block';

    if (!isPowerschool) {
        return false;
    }

    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: id },
        func: async function () {
            async function waitForElm(selector) {
                const c = document.querySelector(selector);
                if (c) return c;

                const observer = new MutationObserver(mutations => {
                    if (document.querySelector(selector)) {
                        observer.disconnect();
                        return document.querySelector(selector)
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                })
            }

            // Wait For Table
            await waitForElm('.zebra');

            // Metadata
            const [course, teacher, expression, term, final] = document.querySelectorAll('tr.center')[1].children;

            // Assignments
            const rows = document.querySelector('.zebra > tbody').querySelectorAll('tr.ng-scope');

            let data = [],
                sum = 0,
                count = 0;

            for (const row of rows) {
                try {
                    const x = row.querySelectorAll('td.ng-binding');

                    const i = parseInt(x[1].innerText.trim());

                    if (!isNaN(i)) {
                        sum += i;
                        count++;

                        const categoryText = row.querySelector('.psonly.ng-binding').innerText;

                        data.push([
                            x[0].innerText, // date
                            categoryText.includes('LLL') || (categoryText.includes('Life') && categoryText.includes('Skills')), // is LLLs ?
                            row.querySelectorAll('span.ng-binding')[1].innerText, // name
                            i // grade
                        ])
                    }
                } catch (err) {
                    continue;
                }
            }

            return {
                metadata: {
                    course: course.innerText.replace(/[0-9]/g, '').trim(),
                    teacher: teacher.innerText.split(',')[0],
                    final: parseInt(final.innerText)
                },
                assignments: data,
                grades: { sum, count }
            };
        },
    });

    console.debug('Scraped Data: \n', result);

    // Metadata
    const [course, teacher] = document.getElementById('metadata').children;
    course.innerText = result.metadata.course;
    teacher.innerText = result.metadata.teacher;

    lastResult = result;

    lastResult.assignments = lastResult.assignments
        .map(array => [new Date(array[0]), array[1], array[2], array[3]]);

    return true;
};

function renderCalculations(result) {
    if (result.metadata.final < targetGrade) {
        document.getElementById('distance').innerText = `You need ${calculateDistance(result.grades)} more points until your grade averages to ${targetGrade}`;
        return;
    }

    document.getElementById('distance').innerHTML = `You have <strong>${calculateLeeway(result.grades)}</strong> points of leeway until you drop to a <strong>${targetGrade - (result.metadata.final === targetGrade ? 1 : 0)}</strong>`;
}

function renderAssignments(includeLLLs) {
    const assignmentsContainer = document.getElementById('assignments');

    assignmentsContainer.innerHTML = '';

    let localAssignments = [
        ...lastResult.assignments
            .filter((a) => a[3] !== targetGrade)
            .sort((a, b) => {
                return a[2] === b[2] ? a[0] - b[0] : a[2] - b[2]
            })
    ];

    if (!includeLLLs) localAssignments = localAssignments.filter(a => !a[1])

    for (let assignment of localAssignments) {
        const article = document.createElement('article');
        article.innerText = assignment[2];
        assignmentsContainer.appendChild(article);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Target Grade
    const select = document.querySelector('select');
    select.addEventListener('change', async () => {
        targetGrade = parseInt(select.value);

        renderCalculations(lastResult);

        chrome.storage.local.set({ target: parseInt(select.value) });
    });

    const { target } = await chrome.storage.local.get(['target']);
    if (target) {
        select.value = target;
        targetGrade = target;
    };

    // Assignments Filter
    const includeLLLsToggle = document.querySelector('input');
    includeLLLsToggle.addEventListener('change', () => {
        renderAssignments(includeLLLsToggle.checked)
        chrome.storage.local.set({ includeLLLs: includeLLLsToggle.checked });
    });

    const { includeLLLs } = await chrome.storage.local.get(['includeLLLs']);
    if (target)
        includeLLLsToggle.checked = includeLLLs;

    if (await start()) {
        renderCalculations(lastResult);
        renderAssignments(includeLLLs.checked);
    }
});

chrome.webNavigation.onCompleted.addListener(start);