// Initialize Lucide icons
lucide.createIcons();

// Tab switching logic
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// Copy to clipboard logic
const copyBtns = document.querySelectorAll('.copy-btn');

copyBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const targetId = btn.getAttribute('data-copy-target');
        const codeBlock = document.querySelector(`#${targetId} code`);
        
        try {
            await navigator.clipboard.writeText(codeBlock.innerText);
            
            // Visual feedback
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check"></i>';
            btn.classList.add('copied');
            lucide.createIcons();
            
            setTimeout(() => {
                btn.innerHTML = originalIcon;
                btn.classList.remove('copied');
                lucide.createIcons();
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });
});
