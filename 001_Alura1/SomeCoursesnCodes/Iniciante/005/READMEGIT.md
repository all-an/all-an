Github

Save username and password

It's working on linux.
Just follow these steps.
Open terminal.
Run this on terminal.
cd ~
sudo nano .netrc

Paste these content there.
machine github.com
login YOUR_GITHUB_USERNAME
password YOUR_GITHUB_PASSWORD

Save and exit.
Close the terminal.
That's all.

git init

git add .

git commit -m "message"

git remote add origin <link>

git branch -m master main   //changing branch

git push -u origin main 
or
git push -f origin main

see online for other things

// delete branch locally
git branch -d localBranchName

// delete branch remotely
git push origin --delete remoteBranchName