#include <stdio.h>

int integer(void);
float floating(void);

int main()
{
	printf("The value returned from integer() is 0x%X\n",integer() );
	printf("The value returned from floating() is %f\n",floating() );

	return 0;
}
