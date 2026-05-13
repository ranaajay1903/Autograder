@echo off
REM Fix Java Runtime Issue on Windows

echo Finding Java installation...

REM Check Program Files for JDK
for /d %%D in ("C:\Program Files\jdk*") do (
    set JAVA_HOME=%%D
    goto found
)

for /d %%D in ("C:\Program Files (x86)\jdk*") do (
    set JAVA_HOME=%%D
    goto found
)

REM Check Oracle Java
for /d %%D in ("C:\Program Files\Java\jdk*") do (
    set JAVA_HOME=%%D
    goto found
)

echo Java home not found automatically. Please set manually.
goto end

:found
echo Found JAVA_HOME: %JAVA_HOME%
setx JAVA_HOME "%JAVA_HOME%"
setx PATH "%JAVA_HOME%\bin;%PATH%"
echo Updated JAVA_HOME and PATH environment variables
echo Please restart PowerShell and run: java -version

:end
pause
