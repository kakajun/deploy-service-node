@echo off
setlocal enabledelayedexpansion
:: 注意这个文件一定要用CRLF格式保存,否则传输过去会代码挤到一起
:: Parameter check
if "%~1"=="" (echo Error: Missing parameter REMOTE_DIR & exit /b 1)
if "%~2"=="" (echo Error: Missing parameter REMOTE_BACKDIR & exit /b 1)
if "%~3"=="" (echo Error: Missing parameter REMOTE_DISTNAME & exit /b 1)
if "%~4"=="" (echo Error: Missing parameter LOCAL_TAR_FILE & exit /b 1)
if "%~5"=="" (echo Error: Missing parameter CURRENT_TIMESTAMP & exit /b 1)

:: Parameter mapping
set REMOTE_DIR=%~1
set REMOTE_BACKDIR=%~2
set REMOTE_DISTNAME=%~3
set LOCAL_TAR_FILE=%~4
set CURRENT_TIMESTAMP=%~5

:: Debug information
echo [INFO] Current working directory: %cd%
echo [INFO] REMOTE_DIR=%REMOTE_DIR%
echo [INFO] REMOTE_BACKDIR=%REMOTE_BACKDIR%
echo [INFO] REMOTE_DISTNAME=%REMOTE_DISTNAME%
echo [INFO] LOCAL_TAR_FILE=%LOCAL_TAR_FILE%
echo [INFO] CURRENT_TIMESTAMP=%CURRENT_TIMESTAMP%

:: Check remote directory
if not exist "%REMOTE_DIR%" (
    echo Error: Directory "%REMOTE_DIR%" does not exist
    exit /b 1
)

:: Change to directory
cd /d "%REMOTE_DIR%" || (
    echo Error: Unable to enter directory "%REMOTE_DIR%"
    exit /b 1
)

:: Check tar file
if not exist "%LOCAL_TAR_FILE%" (
    echo Error: File "%LOCAL_TAR_FILE%" does not exist
    exit /b 1
)

:: Create backup directory if it doesn't exist
if not exist "%REMOTE_BACKDIR%" (
    mkdir "%REMOTE_BACKDIR%" || (
        echo Error: Unable to create backup directory "%REMOTE_BACKDIR%"
        exit /b 1
    )
)

:: Backup old directory if it exists
if exist "%REMOTE_DISTNAME%" (
    move "%REMOTE_DISTNAME%" "%REMOTE_BACKDIR%\%REMOTE_DISTNAME%_%CURRENT_TIMESTAMP%" || (
        echo Error: Unable to backup old directory to "%REMOTE_BACKDIR%"
        exit /b 1
    )
    echo [INFO] Old directory has been backed up to %REMOTE_BACKDIR%\%REMOTE_DISTNAME%_%CURRENT_TIMESTAMP%
)

:: Try tar extraction silently
tar -zxvf "%LOCAL_TAR_FILE%" >nul 2>&1 || (
    echo [INFO] Failed to extract with tar, trying with 7z...
    7z x "%LOCAL_TAR_FILE%" -o"%REMOTE_DIR%" -y || (
        echo Error: Failed to extract with 7z
        exit /b 1
    )

    :: Check if the extracted file is a .tar file
    for %%F in ("%REMOTE_DIR%\*.tar") do (
        echo [INFO] Found additional .tar file: %%F
        7z x "%%F" -o"%REMOTE_DIR%" -y || (
            echo Error: Failed to extract inner .tar file
            exit /b 1
        )
        del "%%F"
    )
)
echo [INFO] Operation completed successfully
exit /b 0
