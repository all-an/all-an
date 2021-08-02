Dicas Git Github

git init // (initializing repository)

git status // (self explained)

git config --local user.name "Seu nome aqui" // (config new user locally only this project, globally all machine)

git config --local user.email "seu@email.aqui" // (config new user)

git config user.name /or/ user.email // (see configs in this machine)

git add filename // (add file,begin monitoring file, stage and add changes before commit)

git add . // (add all files and monitoring all files)

git log // (show all previous commits)

git log online // (show every commit each in one line)

git log -p // (show detailed changes for each commit)

https://devhints.io/git-log // (git log hints)

.gitignore // (inside file names or directories with / right afters)

/// Warning /// Never commit a project that does not run ///

git remote // (enlist all remote servers that our repository know)

git remote add local adress  // (change adress with url or directory)

git remote -v // (show server adress)

git clone adress // (bring / download the repository indicated in adress)

git push foldername branch // (send repository to foldername on specific sbranch)

git pull foldername branch // (update repository with changes from foldername on specific branch)

git branch // (list branchess)

git checkout branch // (change to branch, where branch is the branch name)

git merge branch // (unite branches and changes)

git rebase branch // (make specified branch become the base)

git log --graph // (Show datailed graphic of changes, merges, commits e etc..)