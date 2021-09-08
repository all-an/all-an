#include <stdlib.h>
#include <stdio.h>
#include <locale.h>

int main(){
	FILE *SaveFile;
    char FileName[] = "MyGame.svg";
    
    SaveFile = fopen (FileName, "wb");// opens file for writing and in binary mode
    
    const char SIGNATURE[] = "LSD"; // for Load / Save Demo
    fwrite (SIGNATURE, sizeof(const char), sizeof(SIGNATURE), SaveFile);
    
    const int ENEMIES = 20;
    const int PLAYERS = 2;
    
    typedef struct
	{
		char PlayerName [11];
		unsigned char Lives;
		int xPosition;
		int yPosition;
		int Score;
		int BulletsLeft;
		int Level;
	} sPlayer;

	typedef struct
	{
		unsigned char Alive;
		int xPosition;
		int yPosition;
		int Speed;
	} sEnemy;
    
    sEnemy Enemies[ENEMIES];
	sPlayer Players[PLAYERS];
	
	fwrite (&PLAYERS, sizeof(int), 1, SaveFile);
	fwrite (&ENEMIES, sizeof(int), 1, SaveFile);
	
	fwrite (Players, sizeof (sPlayer), PLAYERS, SaveFile);
	fwrite (Enemies, sizeof (sEnemy), ENEMIES, SaveFile);
	
	fclose (SaveFile);
	
	int a = 1;
	printf("%d", a);
	scanf("%d", &a);
}
